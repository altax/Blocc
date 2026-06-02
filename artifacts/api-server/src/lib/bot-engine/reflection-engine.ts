import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@workspace/db";
import { botMessagesTable, botReflectionsTable, botSettingsTable } from "@workspace/db";
import { desc, isNotNull, avg, sql } from "drizzle-orm";
import { logger } from "../logger";

let reflectionCount = 0;
const REFLECT_EVERY_N_MESSAGES = 20;

const REFLECTION_PROMPT = `Ты — система самоанализа Twitch-бота, который притворяется живым русским зрителем CS2.

Проанализируй последние сообщения бота и их оценки качества (0-100).
Дай честный анализ и конкретные улучшения.

Формат ответа — ТОЛЬКО валидный JSON:
{
  "critique": "Краткий анализ паттернов в 2-3 предложениях. Что повторяется? Что звучит неестественно?",
  "improvements": "3 конкретных улучшения через ; (например: Добавить больше одиночных слов-реакций; Реже использовать KEKW подряд; Чаще реагировать на конкретные игровые моменты)",
  "prompt_delta": "Одна конкретная фраза для добавления в системный промпт, или null если всё ок"
}`;

export async function maybeRunReflection(): Promise<void> {
  reflectionCount++;
  if (reflectionCount % REFLECT_EVERY_N_MESSAGES !== 0) return;

  try {
    const settingsRows = await db.select().from(botSettingsTable).limit(1);
    const settings = settingsRows[0];
    if (!settings?.openaiApiKey && !settings?.geminiApiKey) return;

    await runReflection(settings.openaiApiKey, settings.geminiApiKey || undefined, "auto");
  } catch (err) {
    logger.warn({ err }, "Auto-reflection failed (non-fatal)");
  }
}

export async function runReflection(
  openaiApiKey: string,
  geminiApiKey: string | undefined,
  triggeredBy: "auto" | "manual"
): Promise<{ critique: string; improvements: string; promptDelta: string | null; avgQuality: number | null }> {
  const recentMessages = await db
    .select({
      message: botMessagesTable.message,
      qualityScore: botMessagesTable.qualityScore,
      triggerType: botMessagesTable.triggerType,
      createdAt: botMessagesTable.createdAt,
    })
    .from(botMessagesTable)
    .where(isNotNull(botMessagesTable.qualityScore))
    .orderBy(desc(botMessagesTable.createdAt))
    .limit(30);

  const allRecent = await db
    .select({
      message: botMessagesTable.message,
      qualityScore: botMessagesTable.qualityScore,
    })
    .from(botMessagesTable)
    .orderBy(desc(botMessagesTable.createdAt))
    .limit(30);

  const avgResult = await db
    .select({ avg: avg(botMessagesTable.qualityScore) })
    .from(botMessagesTable)
    .where(isNotNull(botMessagesTable.qualityScore));

  const avgQuality = avgResult[0]?.avg ? Math.round(Number(avgResult[0].avg) * 10) / 10 : null;

  const messagesToAnalyze = (recentMessages.length > 0 ? recentMessages : allRecent).slice(0, 20);
  const messagesBlock = messagesToAnalyze
    .map((m) => `"${m.message}"${m.qualityScore != null ? ` [оценка: ${m.qualityScore}]` : ""}`)
    .join("\n");

  const userPrompt = `Последние ${messagesToAnalyze.length} сообщений бота:\n${messagesBlock}\n\nСредняя оценка качества: ${avgQuality ?? "нет данных"}`;

  let responseText: string | null = null;

  if (openaiApiKey) {
    const client = new OpenAI({ apiKey: openaiApiKey });
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: REFLECTION_PROMPT },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 400,
      temperature: 0.4,
    });
    responseText = res.choices[0]?.message?.content?.trim() ?? null;
  } else if (geminiApiKey) {
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
    const res = await model.generateContent(`${REFLECTION_PROMPT}\n\n${userPrompt}`);
    responseText = res.response.text().trim();
  }

  let critique = "Недостаточно данных для анализа";
  let improvements = "Продолжай накапливать сообщения";
  let promptDelta: string | null = null;

  if (responseText) {
    try {
      const clean = responseText.replace(/```json\n?|```\n?/g, "").trim();
      const parsed = JSON.parse(clean);
      critique = parsed.critique || critique;
      improvements = parsed.improvements || improvements;
      promptDelta = parsed.prompt_delta || null;
    } catch {
      critique = responseText.slice(0, 300);
    }
  }

  await db.insert(botReflectionsTable).values({
    messagesAnalyzed: messagesToAnalyze.length,
    avgQualityBefore: avgQuality,
    critique,
    improvements,
    promptDelta,
    triggeredBy,
  });

  logger.info({ triggeredBy, avgQuality, critique: critique.slice(0, 80) }, "Reflection complete");

  return { critique, improvements, promptDelta, avgQuality };
}
