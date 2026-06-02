import { db } from "@workspace/db";
import { botLogsTable, botMessagesTable, chatPatternsTable, botSettingsTable, goldenBotMessagesTable } from "@workspace/db";
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
import { startNarrative, resetNarrative, addNarrativeEvent, markBotMessageGotReaction, getNarrativeIsActive } from "./stream-narrative";
import { registerBotMessage, feedChatMessage, setReactionCallback, resetReactionTracker, type PendingBotMessage } from "./reaction-tracker";
import { logger } from "../logger";

let ircClient: TwitchIrcClient | null = null;
let decisionTimer: NodeJS.Timeout | null = null;
let hotTriggerTimer: NodeJS.Timeout | null = null;
let lastMessageAt = 0;
let lastHotTriggerAt = 0;

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
 * Callback от reaction-tracker: сообщение бота получило реакции чата.
 * Сохраняем в golden_bot_messages, обновляем narrative.
 */
async function onReactionConfirmed(
  pending: PendingBotMessage,
  reactionScore: number,
  reactionCount: number
): Promise<void> {
  try {
    await db.insert(goldenBotMessagesTable).values({
      message: pending.message,
      triggerType: pending.triggerType,
      contextSnapshot: pending.contextSnapshot.slice(0, 300),
      momentType: pending.momentType,
      channel: pending.channel,
      reactionCount,
      reactionScore,
    });

    markBotMessageGotReaction(pending.message);

    logger.info(
      { message: pending.message.slice(0, 40), reactionScore, reactionCount },
      "Golden pattern saved — message got chat reactions"
    );

    await log(
      "decision",
      `✨ Золотой паттерн: "${pending.message.slice(0, 50)}" (реакция: ${Math.round(reactionScore)}/100, ${reactionCount} ответов)`,
    );
  } catch (err) {
    logger.warn({ err }, "Failed to save golden pattern (non-fatal)");
  }
}

/**
 * Основной цикл принятия решений — запускается каждые 15 секунд.
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
 * Запускается каждые 3 секунды.
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

    const should = await shouldRespond(
      settings.openaiApiKey,
      contextStr,
      false,
      settings.geminiApiKey,
      true
    );

    if (!should) return;

    await sendMessage(settings, patterns, contextStr, "hot_trigger");
  } catch (err) {
    logger.error({ err }, "Hot trigger error");
  }
}

/**
 * Универсальная функция отправки сообщения.
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

  const minDelay = triggerSource === "hot_trigger" ? 500 : settings.minDelaySeconds * 1000;
  const maxDelay = triggerSource === "hot_trigger" ? 3000 : settings.maxDelaySeconds * 1000;
  const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

  await new Promise((r) => setTimeout(r, delay));

  if (!getBotState().running) return;

  ircClient?.sendMessage(message);
  lastMessageAt = Date.now();
  incrementMessagesSent();
  setLastAction(`Sent: "${message}"`);
  addBotMessage(message);

  recordSessionMessage(message);

  // Narrative: записываем что бот написал (gotReaction=false, обновится позже)
  addNarrativeEvent("bot_message", message, gs.momentIntensity, false);

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

  // Reaction tracker: начинаем мониторить реакции чата (RLHF)
  registerBotMessage(
    inserted?.id ?? null,
    message,
    contextStr.slice(0, 300),
    gs.momentType,
    triggerType,
    settings.channelName
  );

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
        if (result?.overall) recordSessionMessage(message, result.overall);
      }).catch(() => {});
    });

    setImmediate(() => {
      maybeRunReflection().catch(() => {});
    });
  }
}

/**
 * Определяет направлена ли речь стримера к зрителям или это внутриигровой каллаут.
 *
 * CS2-стримеры постоянно говорят в игру: "флеш лонг", "двое на б", "снайпер шорт".
 * Эти каллауты НЕ должны попадать в контекст бота как "речь стримера к чату" —
 * они не обращены к зрителям и не несут информации для реакции.
 *
 * Однако updateGameState() всё равно вызывается — каллауты полезны для игрового состояния.
 */
function detectSpeechIntent(text: string): "chat" | "ingame" | "ambiguous" {
  const lower = text.toLowerCase().trim();
  const wordCount = lower.split(/\s+/).filter((w) => w.length > 0).length;

  // Явные сигналы обращения к зрителям
  if (/\b(чат|привет|смотрите|ребят|друзья|зрители|подписчики|спасибо|спс|донат|кстати|кста|вы видели|расскажу|давайте|что думаете|кто думает|войс|диско|бустани|лайк)\b/i.test(lower)) {
    return "chat";
  }

  // Игровые позиции CS2
  const hasPosition = /\b(лонг|шорт|мид|тоннель|хэд|окно|балкон|банан|яма|арки|санни|a.?сайт|b.?сайт|a\s*site|b\s*site|short|long|mid|ramp|catwalk|pit|van|ван|боксы|коридор)\b/i.test(lower);
  // Тактические команды команде
  const hasTactics = /\b(флеш|flash|смок|smoke|пуш|push|ротируй|rotate|форс|force|сейв|save|удерживай|hold|плант|plant|дефуз|defuse|расчисти|clear|фланг|flank|прикрой|cover|дроп|drop|пик|peek)\b/i.test(lower);
  // Информация о противниках
  const hasEnemyInfo = /\b(один остал|двое|трое|четверо|снайпер|awp|вижу\s|слышу|шаги|он там|они там|за углом|последний|ещё один|их двое|их трое)\b/i.test(lower);

  const hasIngameSignal = hasPosition || hasTactics || hasEnemyInfo;

  // Короткий + игровые термины → почти точно каллаут в игру
  if (hasIngameSignal && wordCount <= 6) return "ingame";

  // Длинные фразы без игровых сигналов → скорее чат
  if (wordCount >= 7 && !hasIngameSignal) return "chat";

  return "ambiguous";
}

/**
 * Классификация речи стримера ОБРАЩЁННОЙ К ЧАТУ.
 * Вызывается только если detectSpeechIntent != "ingame".
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

  // Narrative: интересная реплика стримера
  if (isTilted || isHype || isFunny) {
    const intensity = isHype ? 6 : isTilted ? 5 : 4;
    addNarrativeEvent("streamer_speech", text.slice(0, 80), intensity);
  }
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

  resetHypeDetector();
  resetGameState();
  resetReactionTracker();
  resetNarrative();

  startSession(settings.channelName);
  startNarrative(settings.channelName);

  // Регистрируем callback для реакций — сохранять золотые паттерны
  setReactionCallback(onReactionConfirmed);

  await log("decision", `Бот запущен на канале: ${settings.channelName}`);

  ircClient = new TwitchIrcClient({
    username: settings.botUsername || "justinfan" + Math.floor(Math.random() * 99999),
    oauthToken: settings.twitchOauthToken || "SCHMOOPIIE",
    channel: settings.channelName,
    onMessage: (username, message) => {
      if (username.toLowerCase() === (settings.botUsername || "").toLowerCase()) return;

      addChatMessage(username, message);
      recordChatMessage(username, message);

      // Reaction tracker получает все сообщения чата
      feedChatMessage(username, message);

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

  decisionTimer = setInterval(runDecisionLoop, 15_000);
  hotTriggerTimer = setInterval(runHotTriggerCheck, 3_000);

  logger.info({ channel: settings.channelName }, "Bot started with hot trigger + reaction tracker + stream narrative");
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

  resetReactionTracker();
  resetNarrative();

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
 *
 * Важно: updateGameState вызывается всегда — каллауты ("флеш лонг", "двое на б")
 * полезны для извлечения game state. Но в контекст бота как "речь стримера"
 * попадает ТОЛЬКО речь обращённая к зрителям, не внутриигровые переговоры.
 */
export function onSpeechTranscript(text: string): void {
  const intent = detectSpeechIntent(text);

  // Game state обновляем из любой речи (включая каллауты)
  const gs = updateGameState(text);

  // В промпт-контекст и session memory — только речь к зрителям
  if (intent !== "ingame") {
    classifySpeech(text);
  }

  // Narrative: CS2 игровые моменты из речи (независимо от intent)
  if (gs.momentType !== "normal" && gs.momentIntensity >= 4) {
    addNarrativeEvent("game_moment", `${gs.momentType} (речь)`, gs.momentIntensity);
  }
}

/**
 * Публичный API для vision (вызывается из routes при скриншоте)
 */
export function onVisionSummary(summary: string): void {
  addVisionSummary(summary);

  const gs = getGameState();
  if (gs.momentType !== "normal" && gs.momentIntensity >= 5) {
    addNarrativeEvent("game_moment", `${gs.momentType}: ${summary.slice(0, 80)}`, gs.momentIntensity);
  }
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
    narrative_active: getNarrativeIsActive(),
  };
}
