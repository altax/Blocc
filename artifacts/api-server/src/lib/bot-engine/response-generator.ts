import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@workspace/db";
import { chatPatternsTable, goldenBotMessagesTable } from "@workspace/db";
import { desc, sql } from "drizzle-orm";
import { logger } from "../logger";
import { getGameState } from "./game-state-machine";
import { getHypeState } from "./chat-hype-detector";
import { getSession } from "./session-memory";
import { selectContextualPatterns } from "./context-builder";

let openaiClient: OpenAI | null = null;

function getOpenAIClient(apiKey: string): OpenAI {
  if (!openaiClient || (openaiClient as any)._apiKey !== apiKey) {
    openaiClient = new OpenAI({ apiKey });
    (openaiClient as any)._apiKey = apiKey;
  }
  return openaiClient;
}

export function resetClient(): void {
  openaiClient = null;
}

async function fetchLearnedPatterns(limit = 60): Promise<string[]> {
  try {
    const rows = await db
      .select({ content: chatPatternsTable.content })
      .from(chatPatternsTable)
      .orderBy(desc(sql`quality_score * LN(frequency + 1)`))
      .limit(limit);
    return rows.map((r) => r.content);
  } catch {
    return [];
  }
}

/**
 * Золотые примеры — собственные сообщения бота которые получили реальные
 * реакции от чата. Это наш RLHF-сигнал: что точно работает.
 */
async function fetchGoldenMessages(limit = 8): Promise<Array<{ message: string; reactionScore: number; momentType: string | null }>> {
  try {
    const rows = await db
      .select({
        message: goldenBotMessagesTable.message,
        reactionScore: goldenBotMessagesTable.reactionScore,
        momentType: goldenBotMessagesTable.momentType,
      })
      .from(goldenBotMessagesTable)
      .orderBy(desc(sql`reaction_score * LN(reaction_count + 1)`))
      .limit(limit);
    return rows;
  } catch {
    return [];
  }
}

// Опечатки — симуляция живого человека (18% сообщений)
function maybeAddTypo(text: string): string {
  if (Math.random() > 0.18) return text;

  const skipEnd = text.endsWith(".") ? text.slice(0, -1) : text;

  if (Math.random() < 0.4 && skipEnd.length > 4) {
    const idx = Math.floor(Math.random() * (skipEnd.length - 2)) + 1;
    return skipEnd.slice(0, idx) + skipEnd[idx] + skipEnd.slice(idx);
  }

  if (Math.random() < 0.3 && skipEnd.length > 5) {
    const idx = Math.floor(Math.random() * (skipEnd.length - 2)) + 1;
    return skipEnd.slice(0, idx) + skipEnd.slice(idx + 1);
  }

  return text;
}

/**
 * Контекстно-зависимая инъекция паттерна.
 * При высоком хайпе — выше шанс.
 */
function maybeInjectPattern(message: string, allPatterns: string[]): string {
  const hs = getHypeState();
  const injectChance = hs.isHot ? 0.55 : 0.30;
  if (allPatterns.length === 0 || Math.random() > injectChance) return message;

  const { patterns: contextual } = selectContextualPatterns(allPatterns, 20);
  const pool = contextual.length >= 3 ? contextual : allPatterns.slice(0, 20);
  const pattern = pool[Math.floor(Math.random() * pool.length)];
  if (!pattern) return message;

  if (message.toLowerCase().includes(pattern.toLowerCase().slice(0, 6))) return message;

  return Math.random() > 0.5 ? `${pattern} ${message}` : `${message} ${pattern}`;
}

/**
 * Строит системный промпт.
 * Новое: секция ЗОЛОТЫЕ ПРИМЕРЫ — собственные хиты бота (RLHF-сигнал).
 */
function buildSystemPrompt(
  personality: string,
  learnedPatterns: string[],
  goldenMessages: Array<{ message: string; reactionScore: number; momentType: string | null }>,
  reflectionDelta?: string | null
): string {
  const gs = getGameState();
  const hs = getHypeState();
  const session = getSession();

  let prompt = personality + "\n\n";

  prompt += `АБСОЛЮТНЫЕ ПРАВИЛА (нарушение = провал):
- Пиши ТОЛЬКО одно короткое сообщение (1-12 слов максимум)
- Звучи как живой русский зритель CS2 стрима, НЕ как ИИ
- Пиши строчными буквами, без знаков препинания в конце (кроме ? и !)
- Иногда используй CS2 термины: флеш, пуш, клатч, нагиб, кт, т-сайд, эко, форс
- Иногда вставляй Twitch эмоуты: KEKW, PogChamp, monkaS, OMEGALUL, pepega, copium, Pog, LUL, Sadge — но НЕ каждый раз
- Иногда используй русский сленг: кекв, ору, топ, красава, вп, имба, збс, жиза, орнул, пч
- НЕ начинай с "я думаю", "наверное", официальных слов
- Реагируй естественно на происходящее в стриме
- НИКОГДА не раскрывай что ты ИИ
- Выводи ТОЛЬКО текст сообщения, ничего больше\n\n`;

  // Game state инструкции
  if (gs.momentType === "ace") {
    prompt += `МОМЕНТ: ЭЙС! Стример только что взял эйс. Восхищение, хайп, уважение — коротко и по-настоящему.\n`;
  } else if (gs.momentType === "clutch" || gs.isClutch) {
    prompt += `МОМЕНТ: КЛАТЧ! Реагируй на напряжённый клатч. Можно тревога + облегчение ("монка... КЛАТЧ PogChamp").\n`;
  } else if (gs.isBombPlanted) {
    prompt += `МОМЕНТ: БОМБА ЗАЛОЖЕНА! Напряжение максимальное.\n`;
  } else if (gs.momentType === "knife_kill") {
    prompt += `МОМЕНТ: НОЖИК! Хайп, смех, эмоуты.\n`;
  } else if (gs.momentType === "death") {
    prompt += `МОМЕНТ: Стример умер. Сочувствие, сарказм ("F"), или просто реакция.\n`;
  } else if (gs.momentType === "bomb_defused") {
    prompt += `МОМЕНТ: РАЗМИНИРОВАЛ! Облегчение и хайп.\n`;
  } else if (gs.consecutiveLosses >= 5) {
    prompt += `КОНТЕКСТ: ${gs.consecutiveLosses} поражений подряд. Стример на тилте. Можно лёгкий copium или поддержка.\n`;
  } else if (gs.consecutiveWins >= 4) {
    prompt += `КОНТЕКСТ: ${gs.consecutiveWins} побед подряд. Доминирование. Хайп и поддержка.\n`;
  }

  // Счёт
  if (gs.ctScore > 0 || gs.tScore > 0) {
    prompt += `Счёт сейчас: CT ${gs.ctScore} - T ${gs.tScore}`;
    if (gs.map) prompt += ` (${gs.map})`;
    prompt += `\n`;
  }

  // Хайп чата
  if (hs.currentLevel >= 8) {
    prompt += `ЧАТ ВЗРЫВАЕТСЯ (уровень ${hs.currentLevel}/10). Подхвати волну — коротко и эмоционально.\n`;
    if (hs.dominantTopic) prompt += `Главная тема: "${hs.dominantTopic}"\n`;
  } else if (hs.currentLevel >= 5) {
    prompt += `Чат разгорается (${hs.currentLevel}/10). Можно подхватить энергию.\n`;
  }

  // Настроение сессии
  if (session?.botMood === "tilted") {
    prompt += `Последние сообщения получили низкие оценки. Попробуй что-то другое — короче и проще.\n`;
  } else if (session?.botMood === "hyped") {
    prompt += `Последние сообщения заходили хорошо. Продолжай в том же духе.\n`;
  }

  // Рефлексия
  if (reflectionDelta) {
    prompt += `\nСАМОКОРРЕКЦИЯ (из анализа прошлых сообщений): ${reflectionDelta}\n`;
  }

  // === ЗОЛОТЫЕ ПРИМЕРЫ (RLHF-сигнал) ===
  // Это твои собственные сообщения, которые реально получили реакции от чата.
  // Самый ценный сигнал — выше по приоритету чем обычные паттерны.
  if (goldenMessages.length > 0) {
    prompt += `\nЗОЛОТЫЕ ПРИМЕРЫ — твои сообщения которые РЕАЛЬНО зашли в этот чат (высокая реакция зрителей):`;

    // Фильтруем под текущий момент если возможно
    const momentFiltered = goldenMessages.filter(
      (g) => g.momentType === gs.momentType && gs.momentType !== "normal"
    );
    const pool = momentFiltered.length >= 2 ? momentFiltered : goldenMessages;

    pool.slice(0, 6).forEach((g) => {
      prompt += `\n- "${g.message}" [реакция: ${Math.round(g.reactionScore)}/100]`;
    });

    prompt += `\nПиши в похожем стиле, НО не копируй дословно — придумай своё.\n`;
  }

  // Обычные паттерны
  if (learnedPatterns.length > 0) {
    const { patterns: contextual, reason } = selectContextualPatterns(learnedPatterns, 20);
    prompt += `\nРЕАЛЬНЫЕ ПРИМЕРЫ из чата топовых CS2 стримеров [${reason}] (похожий стиль и лексика, не копировать дословно):\n`;
    prompt += contextual.map((p) => `- "${p}"`).join("\n");
  }

  return prompt;
}

async function getLatestReflectionDelta(): Promise<string | null> {
  try {
    const { botReflectionsTable } = await import("@workspace/db");
    const { desc: descOp } = await import("drizzle-orm");
    const rows = await db
      .select({ promptDelta: botReflectionsTable.promptDelta })
      .from(botReflectionsTable)
      .orderBy(descOp(botReflectionsTable.createdAt))
      .limit(1);
    return rows[0]?.promptDelta ?? null;
  } catch {
    return null;
  }
}

/**
 * Основная функция генерации сообщения.
 * Промпт теперь включает: golden patterns (RLHF), reflection delta, game state.
 */
export async function generateChatMessage(
  apiKey: string,
  personality: string,
  contextString: string,
  triggerType: string,
  geminiApiKey?: string
): Promise<string | null> {
  try {
    const [learnedPatterns, goldenMessages, reflectionDelta] = await Promise.all([
      fetchLearnedPatterns(60),
      fetchGoldenMessages(8),
      getLatestReflectionDelta(),
    ]);

    const systemPrompt = buildSystemPrompt(personality, learnedPatterns, goldenMessages, reflectionDelta);
    const userPrompt = `Текущий контекст стрима:\n${contextString}\n\nТриггер: ${triggerType}\n\nНапиши одно естественное сообщение в чат как живой зритель:`;

    let message: string | null = null;

    if (apiKey) {
      const client = getOpenAIClient(apiKey);
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 50,
        temperature: 0.92,
        presence_penalty: 0.4,
        frequency_penalty: 0.5,
      });
      message = response.choices[0]?.message?.content?.trim() ?? null;
    } else if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const response = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      message = response.response.text().trim() || null;
    } else {
      return null;
    }

    if (!message) return null;

    message = message.replace(/^["«»'"]|["«»'"]$/g, "").trim();
    message = message.split("\n")[0]?.trim() ?? message;

    message = maybeInjectPattern(message, learnedPatterns);
    message = maybeAddTypo(message);

    return message;
  } catch (err) {
    logger.error({ err }, "Failed to generate chat message");
    return null;
  }
}

/**
 * Умный shouldRespond — учитывает game state и hype.
 */
export async function shouldRespond(
  apiKey: string,
  contextString: string,
  cooldownActive: boolean,
  geminiApiKey?: string,
  forceTrigger?: boolean
): Promise<boolean> {
  if (cooldownActive && !forceTrigger) return false;

  const gs = getGameState();
  const hs = getHypeState();

  if (!forceTrigger && Math.random() < 0.15) return false;

  if (gs.momentIntensity >= 8 || gs.momentType === "ace" || gs.momentType === "clutch") {
    return true;
  }

  if (hs.isHot && hs.currentLevel >= 8) {
    return true;
  }

  if (gs.isBombPlanted && Math.random() < 0.7) return true;

  if (forceTrigger) return true;

  try {
    const gameContext = gs.momentType !== "normal"
      ? `\nCS2 момент: ${gs.momentType} (интенсивность ${gs.momentIntensity}/10)`
      : "";

    const hypeContext = hs.currentLevel >= 4
      ? `\nЧат на уровне хайпа ${hs.currentLevel}/10`
      : "";

    const systemContent = `Ты решаешь, должен ли русский зритель CS2 стрима написать сообщение в чат прямо сейчас.
Отвечай ТОЛЬКО 'yes' или 'no'.
Отвечай 'yes' если: фраг/клатч/эйс/красивый момент/стример сказал что-то интересное/смешное/вопрос чату/чат активно реагирует.
Отвечай 'no' если: стрим спокойный, ничего не происходит, стример просто ходит по карте, бот недавно уже писал.
Реальные зрители пишут примерно раз в 1-3 минуты, не чаще.`;

    const userContent = `Контекст:${gameContext}${hypeContext}\n${contextString.slice(0, 600)}\n\nПисать в чат?`;

    if (apiKey) {
      const client = getOpenAIClient(apiKey);
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        max_tokens: 5,
        temperature: 0.2,
      });
      const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
      return answer === "yes";
    } else if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const response = await model.generateContent(`${systemContent}\n\n${userContent}`);
      const answer = response.response.text().trim().toLowerCase();
      return answer.includes("yes");
    }

    return Math.random() < 0.25;
  } catch {
    return Math.random() < 0.25;
  }
}
