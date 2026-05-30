import OpenAI from "openai";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { logger } from "../logger";

let openaiClient: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
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

  const typos: Array<[RegExp, string]> = [
    [/а/g, "а"],
    [/е/g, "е"],
    [/ть$/g, "тб"],
    [/ing\b/g, "ign"],
    [/the\b/g, "teh"],
  ];

  // Пропустить последний символ (нет точки/запятой)
  const skipEnd = text.endsWith(".") ? text.slice(0, -1) : text;

  // Иногда удвоить букву
  if (Math.random() < 0.4 && skipEnd.length > 4) {
    const idx = Math.floor(Math.random() * (skipEnd.length - 2)) + 1;
    return skipEnd.slice(0, idx) + skipEnd[idx] + skipEnd.slice(idx);
  }

  // Иногда пропустить букву
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
  // Добавляем паттерн в начало или конец
  return Math.random() > 0.5 ? `${pattern} ${message}` : `${message} ${pattern}`;
}

export async function generateChatMessage(
  apiKey: string,
  personality: string,
  contextString: string,
  triggerType: string
): Promise<string | null> {
  try {
    const client = getClient(apiKey);
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

    let message = response.choices[0]?.message?.content?.trim();
    if (!message) return null;

    // Убираем кавычки если модель их добавила
    message = message.replace(/^["«»'"]|["«»'"]$/g, "").trim();

    // Иногда инжектируем выученный паттерн
    message = maybeInjectPattern(message, learnedPatterns);

    // Иногда добавляем опечатку для реализма
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
  cooldownActive: boolean
): Promise<boolean> {
  if (cooldownActive) return false;

  // Рандомный шанс промолчать даже без кулдауна — как реальный человек
  if (Math.random() < 0.15) return false;

  try {
    const client = getClient(apiKey);
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Ты решаешь, должен ли русский зритель CS2 стрима написать сообщение в чат прямо сейчас.
Отвечай ТОЛЬКО 'yes' или 'no'.
Отвечай 'yes' если: фраг/клатч/эйс/красивый момент/стример сказал что-то интересное/смешное/вопрос чату.
Отвечай 'no' если: стрим спокойный, ничего не происходит, стример просто ходит по карте.
Реальные зрители пишут примерно раз в 1-3 минуты, не чаще.`,
        },
        {
          role: "user",
          content: `Контекст:\n${contextString}\n\nПисать в чат?`,
        },
      ],
      max_tokens: 5,
      temperature: 0.3,
    });

    const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
    return answer === "yes";
  } catch {
    return Math.random() < 0.25;
  }
}
