import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "../logger";

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

async function fetchLearnedPatterns(limit = 40): Promise<string[]> {
  try {
    const rows = await db
      .select({ content: chatPatternsTable.content, lang: chatPatternsTable.language })
      .from(chatPatternsTable)
      .orderBy(desc(chatPatternsTable.frequency))
      .limit(limit);
    return rows.map((r) => r.content);
  } catch {
    return [];
  }
}

// Симуляция случайных опечаток, характерных для реальных людей в чате
function maybeAddTypo(text: string): string {
  if (Math.random() > 0.18) return text; // только 18% сообщений с опечатками

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

// Добавляем реальный паттерн из обученных данных с вероятностью 30%
function maybeInjectPattern(message: string, patterns: string[]): string {
  if (patterns.length === 0 || Math.random() > 0.30) return message;
  const pattern = patterns[Math.floor(Math.random() * Math.min(patterns.length, 20))];
  return Math.random() > 0.5 ? `${pattern} ${message}` : `${message} ${pattern}`;
}

/**
 * Генерирует сообщение через OpenAI или Gemini (fallback).
 * Gemini 2.0 Flash — бесплатно на aistudio.google.com
 */
export async function generateChatMessage(
  apiKey: string,
  personality: string,
  contextString: string,
  triggerType: string,
  geminiApiKey?: string
): Promise<string | null> {
  try {
    const learnedPatterns = await fetchLearnedPatterns(40);

    const patternsBlock = learnedPatterns.length > 0
      ? `\n\nРЕАЛЬНЫЕ ПРИМЕРЫ из чата топовых CS2 стримеров (используй похожий стиль и лексику):\n${learnedPatterns.slice(0, 20).map((p) => `- "${p}"`).join("\n")}`
      : "";

    const systemPrompt = `${personality}

АБСОЛЮТНЫЕ ПРАВИЛА (нарушение = провал):
- Пиши ТОЛЬКО одно короткое сообщение (1-12 слов максимум)
- Звучи как живой русский зритель CS2 стрима, НЕ как ИИ
- Пиши строчными буквами, без знаков препинания в конце (кроме ? и !)
- Иногда используй CS2 термины: флеш, пуш, клатч, нагиб, кт, т-сайд
- Иногда вставляй Twitch эмоуты: KEKW, PogChamp, monkaS, OMEGALUL, pepega, copium, Pog, LUL — но НЕ каждый раз
- Иногда используй русский сленг: кекв, ору, топ, красава, вп, имба, збс
- НЕ начинай с "я думаю", "наверное", официальных слов
- Реагируй естественно на происходящее в стриме
- НИКОГДА не раскрывай что ты ИИ
- Выводи ТОЛЬКО текст сообщения, ничего больше${patternsBlock}`;

    const userPrompt = `Текущий контекст стрима:\n${contextString}\n\nТриггер: ${triggerType}\n\nНапиши одно естественное сообщение в чат как живой зритель:`;

    let message: string | null = null;

    if (apiKey) {
      // OpenAI GPT-4o-mini
      const client = getOpenAIClient(apiKey);
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 50,
        temperature: 0.92,
        presence_penalty: 0.3,
        frequency_penalty: 0.4,
      });
      message = response.choices[0]?.message?.content?.trim() ?? null;
    } else if (geminiApiKey) {
      // Google Gemini 2.0 Flash (бесплатно)
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const response = await model.generateContent(`${systemPrompt}\n\n${userPrompt}`);
      message = response.response.text().trim() || null;
    } else {
      return null;
    }

    if (!message) return null;

    // Убираем кавычки если модель их добавила
    message = message.replace(/^["«»'"]|["«»'"]$/g, "").trim();
    // Берём только первую строку (Gemini иногда пишет несколько)
    message = message.split("\n")[0]?.trim() ?? message;

    message = maybeInjectPattern(message, learnedPatterns);
    message = maybeAddTypo(message);

    return message;
  } catch (err) {
    logger.error({ err }, "Failed to generate chat message");
    return null;
  }
}

export async function shouldRespond(
  apiKey: string,
  contextString: string,
  cooldownActive: boolean,
  geminiApiKey?: string
): Promise<boolean> {
  if (cooldownActive) return false;

  if (Math.random() < 0.15) return false;

  try {
    const systemContent = `Ты решаешь, должен ли русский зритель CS2 стрима написать сообщение в чат прямо сейчас.
Отвечай ТОЛЬКО 'yes' или 'no'.
Отвечай 'yes' если: фраг/клатч/эйс/красивый момент/стример сказал что-то интересное/смешное/вопрос чату.
Отвечай 'no' если: стрим спокойный, ничего не происходит, стример просто ходит по карте.
Реальные зрители пишут примерно раз в 1-3 минуты, не чаще.`;

    const userContent = `Контекст:\n${contextString}\n\nПисать в чат?`;

    if (apiKey) {
      const client = getOpenAIClient(apiKey);
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemContent },
          { role: "user", content: userContent },
        ],
        max_tokens: 5,
        temperature: 0.3,
      });
      const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
      return answer === "yes";
    } else if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const response = await model.generateContent(
        `${systemContent}\n\n${userContent}`
      );
      const answer = response.response.text().trim().toLowerCase();
      return answer.includes("yes");
    }

    return Math.random() < 0.25;
  } catch {
    return Math.random() < 0.25;
  }
}
