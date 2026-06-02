import { db } from "@workspace/db";
import { botLogsTable, botMessagesTable, chatPatternsTable, botSettingsTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { getBotState, setBotRunning, incrementMessagesSent, setLastAction, getUptimeSeconds } from "../bot-state";
import { TwitchIrcClient } from "./twitch-irc";
import { buildContextString, addChatMessage, addBotMessage, addVisionSummary, addSpeechTranscript, getContext } from "./context-builder";
import { generateChatMessage, shouldRespond } from "./response-generator";
import { scoreBotMessage } from "./quality-scorer";
import { maybeRunReflection } from "./reflection-engine";
import { recordChatMessage, getHypeState, resetHypeDetector } from "./chat-hype-detector";
import { updateGameState, getGameState, resetGameState } from "./game-state-machine";
import { startSession, endSession, recordNotableMoment, recordBotMessage as recordSessionMessage, recordStreamerNote } from "./session-memory";
import { logger } from "../logger";

let ircClient: TwitchIrcClient | null = null;
let decisionTimer: NodeJS.Timeout | null = null;
let hotTriggerTimer: NodeJS.Timeout | null = null;
let lastMessageAt = 0;
let lastHotTriggerAt = 0;

// Минимальная задержка между горячими триггерами (не спамить на одном моменте)
const HOT_TRIGGER_COOLDOWN_MS = 8_000;

async function log(type: string, content: string, metadata?: string): Promise<void> {
  try {
    await db.insert(botLogsTable).values({ type, content, metadata: metadata ?? null });
  } catch (err) {
    logger.error({ err }, "Failed to insert log");
  }
}

async function getSettings() {
  const rows = await db.select().from(botSettingsTable).limit(1);
  return rows[0] ?? null;
}

async function getQualityWeightedPatterns(): Promise<string[]> {
  const rows = await db
    .select({ content: chatPatternsTable.content, qualityScore: chatPatternsTable.qualityScore })
    .from(chatPatternsTable)
    .orderBy(desc(sql`quality_score * LN(frequency + 1)`))
    .limit(60);
  return rows.map((r) => r.content);
}

/**
 * Основной цикл принятия решений — запускается каждые 15 секунд.
 * Стандартный путь: cooldown → shouldRespond → generate → send.
 */
async function runDecisionLoop(): Promise<void> {
  const settings = await getSettings();
  if (!settings || !getBotState().running) return;

  const now = Date.now();
  const cooldownMs = settings.cooldownSeconds * 1000;
  const cooldownActive = now - lastMessageAt < cooldownMs;

  if (cooldownActive) return;

  try {
    const patterns = await getQualityWeightedPatterns();
    const contextStr = buildContextString(patterns);

    const should = await shouldRespond(
      settings.openaiApiKey,
      contextStr,
      cooldownActive,
      settings.geminiApiKey
    );

    await log("decision", should ? "Решил отправить сообщение" : "Решил промолчать", contextStr.slice(0, 400));

    if (!should) return;

    await sendMessage(settings, patterns, contextStr, "decision");
  } catch (err) {
    logger.error({ err }, "Decision loop error");
    await log("error", `Ошибка цикла: ${String(err)}`);
  }
}

/**
 * Горячий триггер — мониторит хайп чата и интенсивность момента.
 * Запускается каждые 3 секунды. При высоком хайпе → немедленная реакция.
 */
async function runHotTriggerCheck(): Promise<void> {
  if (!getBotState().running) return;

  const now = Date.now();
  if (now - lastHotTriggerAt < HOT_TRIGGER_COOLDOWN_MS) return;

  const settings = await getSettings();
  if (!settings) return;

  const cooldownMs = settings.cooldownSeconds * 1000;
  if (now - lastMessageAt < cooldownMs) return;

  const hs = getHypeState();
  const gs = getGameState();

  const isHotMoment =
    (gs.momentIntensity >= 8 && gs.momentType !== "normal") ||
    (hs.isHot && hs.currentLevel >= 8) ||
    gs.momentType === "ace" ||
    gs.momentType === "clutch" ||
    gs.momentType === "knife_kill";

  if (!isHotMoment) return;

  lastHotTriggerAt = now;

  try {
    await log(
      "decision",
      `🔥 Hot trigger: ${gs.momentType} (интенсивность ${gs.momentIntensity}) | хайп чата: ${hs.currentLevel}`,
    );

    const patterns = await getQualityWeightedPatterns();
    const contextStr = buildContextString(patterns);

    // Горячий триггер обходит shouldRespond — момент уже проверен
    const should = await shouldRespond(
      settings.openaiApiKey,
      contextStr,
      false, // cooldown уже проверен выше
      settings.geminiApiKey,
      true // forceTrigger
    );

    if (!should) return;

    await sendMessage(settings, patterns, contextStr, "hot_trigger");
  } catch (err) {
    logger.error({ err }, "Hot trigger error");
  }
}

/**
 * Универсальная функция отправки сообщения.
 * Используется и из decision loop, и из hot trigger.
 */
async function sendMessage(
  settings: Awaited<ReturnType<typeof getSettings>>,
  patterns: string[],
  contextStr: string,
  triggerSource: string
): Promise<void> {
  if (!settings) return;

  const context = getContext();
  const gs = getGameState();
  const hs = getHypeState();

  // Определяем trigger type для записи
  let triggerType: string;
  if (triggerSource === "hot_trigger") {
    triggerType = gs.momentType !== "normal" ? `hot_${gs.momentType}` : "hot_hype";
  } else {
    triggerType = context.recentSpeech.length > context.recentVisionSummaries.length
      ? "speech"
      : "vision";
  }

  const message = await generateChatMessage(
    settings.openaiApiKey,
    settings.personality,
    contextStr,
    triggerType,
    settings.geminiApiKey
  );

  if (!message) return;

  // Задержка: горячие триггеры реагируют быстрее (0.5-3 сек), обычные — медленнее
  const minDelay = triggerSource === "hot_trigger"
    ? 500
    : settings.minDelaySeconds * 1000;
  const maxDelay = triggerSource === "hot_trigger"
    ? 3000
    : settings.maxDelaySeconds * 1000;
  const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

  await new Promise((r) => setTimeout(r, delay));

  if (!getBotState().running) return;

  ircClient?.sendMessage(message);
  lastMessageAt = Date.now();
  incrementMessagesSent();
  setLastAction(`Sent: "${message}"`);
  addBotMessage(message);

  // Записываем в session memory
  recordSessionMessage(message);

  // Записываем заметный момент если это был hot trigger
  if (triggerSource === "hot_trigger" && gs.momentIntensity >= 7) {
    recordNotableMoment(gs.momentType, gs.lastEventDescription, gs.momentIntensity, true);
  }

  await log("message_sent", message, JSON.stringify({
    triggerType,
    triggerSource,
    delay,
    momentType: gs.momentType,
    momentIntensity: gs.momentIntensity,
    hypeLevel: hs.currentLevel,
  }));

  const [inserted] = await db.insert(botMessagesTable).values({
    channel: settings.channelName,
    message,
    triggerType,
    contextSummary: contextStr.slice(0, 300),
  }).returning({ id: botMessagesTable.id });

  // Асинхронные задачи: scoring + reflection
  if (inserted?.id && (settings.openaiApiKey || settings.geminiApiKey)) {
    setImmediate(() => {
      scoreBotMessage(
        inserted.id,
        message,
        contextStr.slice(0, 300),
        settings.openaiApiKey,
        settings.geminiApiKey || undefined
      ).then((result: any) => {
        // Обновляем session memory качеством
        if (result?.overall) recordSessionMessage(message, result.overall);
      }).catch(() => {});
    });

    setImmediate(() => {
      maybeRunReflection().catch(() => {});
    });
  }
}

/**
 * Слушаем речь стримера и классифицируем по типу
 */
function classifySpeech(text: string): void {
  const lower = text.toLowerCase();

  const isFunny = /лол|кек|хах|смеш|ору|блин/i.test(lower);
  const isTilted = /блять|сука|нуб|идиот|стоп|всё|тупой/i.test(lower);
  const isHype = /нееее|топ|красава|вп|дааа|омг/i.test(lower);
  const isQuestion = text.includes("?");

  if (isFunny) recordStreamerNote(text, "funny");
  else if (isTilted) recordStreamerNote(text, "tilt");
  else if (isHype) recordStreamerNote(text, "hype");
  else if (isQuestion) recordStreamerNote(text, "question");
  else if (text.length > 20) recordStreamerNote(text, "info");

  addSpeechTranscript(text);
}

export async function startBot(): Promise<void> {
  if (getBotState().running) return;

  const settings = await getSettings();
  if (!settings) throw new Error("No settings configured");
  if (!settings.channelName) throw new Error("Channel name not set");
  if (!settings.openaiApiKey && !settings.geminiApiKey) {
    throw new Error("Нужен API ключ: добавь OpenAI или Gemini ключ в Settings");
  }

  setBotRunning(true, settings.channelName);

  // Инициализируем новые модули
  resetHypeDetector();
  resetGameState();
  startSession(settings.channelName);

  await log("decision", `Бот запущен на канале: ${settings.channelName}`);

  ircClient = new TwitchIrcClient({
    username: settings.botUsername || "justinfan" + Math.floor(Math.random() * 99999),
    oauthToken: settings.twitchOauthToken || "SCHMOOPIIE",
    channel: settings.channelName,
    onMessage: (username, message) => {
      if (username.toLowerCase() === (settings.botUsername || "").toLowerCase()) return;

      // Пишем в context builder
      addChatMessage(username, message);

      // Пишем в hype detector
      recordChatMessage(username, message);

      // Если это речь стримера — классифицируем (для каналов со STT)
      if (username === settings.channelName.toLowerCase()) {
        classifySpeech(message);
      }
    },
    onConnected: () => {
      log("decision", `Подключились к IRC #${settings.channelName}`);
    },
    onDisconnected: () => {
      log("error", "Отключились от IRC");
    },
  });

  try {
    await ircClient.connect();
  } catch (err) {
    logger.warn({ err }, "IRC connection failed, running in offline mode");
    await log("error", `IRC connect failed: ${String(err)} — работаем в симуляционном режиме`);
  }

  // Стандартный таймер — каждые 15 секунд
  decisionTimer = setInterval(runDecisionLoop, 15_000);

  // Горячий триггер — каждые 3 секунды
  hotTriggerTimer = setInterval(runHotTriggerCheck, 3_000);

  logger.info({ channel: settings.channelName }, "Bot started with hot trigger system");
}

export async function stopBot(): Promise<void> {
  setBotRunning(false);

  if (decisionTimer) {
    clearInterval(decisionTimer);
    decisionTimer = null;
  }
  if (hotTriggerTimer) {
    clearInterval(hotTriggerTimer);
    hotTriggerTimer = null;
  }

  ircClient?.disconnect();
  ircClient = null;

  // Сохраняем итоги сессии
  const sessionSummary = endSession();
  if (sessionSummary) {
    logger.info(
      {
        messagesSent: sessionSummary.messagesSent,
        avgQuality: sessionSummary.avgQualityScore,
        duration: Math.floor((Date.now() - sessionSummary.startedAt) / 60_000),
      },
      "Session ended"
    );
    await log(
      "decision",
      `Сессия завершена: ${sessionSummary.messagesSent} сообщений, средняя оценка ${sessionSummary.avgQualityScore}/100`
    );
  }

  await log("decision", "Бот остановлен");
}

/**
 * Публичный API для speech (вызывается из routes при STT)
 */
export function onSpeechTranscript(text: string): void {
  classifySpeech(text);
  // Обновляем game state из речи стримера
  updateGameState(text);
}

/**
 * Публичный API для vision (вызывается из routes при скриншоте)
 */
export function onVisionSummary(summary: string): void {
  addVisionSummary(summary);
  // game state уже обновляется внутри vision-analyzer
}

export function getBotStatusPayload() {
  const state = getBotState();
  const gs = getGameState();
  const hs = getHypeState();

  return {
    running: state.running,
    channel: state.channel,
    uptime_seconds: getUptimeSeconds(),
    messages_sent: state.messagesSent,
    last_action: state.lastAction,
    // Новые поля
    game_state: {
      moment_type: gs.momentType,
      moment_intensity: gs.momentIntensity,
      session_mood: gs.sessionMood,
      ct_score: gs.ctScore,
      t_score: gs.tScore,
      map: gs.map ?? null,
      is_clutch: gs.isClutch,
      bomb_planted: gs.isBombPlanted,
    },
    hype_state: {
      level: hs.currentLevel,
      is_hot: hs.isHot,
      velocity: hs.chatVelocity,
      dominant_topic: hs.dominantTopic,
    },
  };
}
