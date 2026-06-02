import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db } from "@workspace/db";
import { botMessagesTable, chatPatternsTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../logger";

interface QualityBreakdown {
  naturalness: number;
  contextFit: number;
  styleMatch: number;
  brevity: number;
  overall: number;
  issues: string[];
}

const SCORE_PROMPT = `Ты — эксперт по анализу Twitch-чатов русских CS2 стримеров.
Оцени сообщение бота по 4 критериям (0-100 каждый):

1. naturalness — насколько звучит как живой человек, не бот
2. context_fit — насколько подходит к контексту стрима
3. style_match — соответствие стилю русского CS2 чата (сленг, эмоуты, короткость)
4. brevity — подходящая длина (8-12 слов = 100, слишком длинное/короткое = меньше)

Также укажи до 2 проблем (issues) если есть.

Отвечай ТОЛЬКО валидным JSON без markdown:
{"naturalness":N,"context_fit":N,"style_match":N,"brevity":N,"overall":N,"issues":["..."]}`;

async function parseScoreResponse(text: string): Promise<QualityBreakdown | null> {
  try {
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    const json = JSON.parse(clean);
    return {
      naturalness: Math.min(100, Math.max(0, Number(json.naturalness) || 50)),
      contextFit: Math.min(100, Math.max(0, Number(json.context_fit) || 50)),
      styleMatch: Math.min(100, Math.max(0, Number(json.style_match) || 50)),
      brevity: Math.min(100, Math.max(0, Number(json.brevity) || 50)),
      overall: Math.min(100, Math.max(0, Number(json.overall) || 50)),
      issues: Array.isArray(json.issues) ? json.issues.slice(0, 2) : [],
    };
  } catch {
    return null;
  }
}

export async function scoreBotMessage(
  messageId: number,
  message: string,
  contextSummary: string,
  openaiApiKey: string,
  geminiApiKey?: string
): Promise<void> {
  try {
    const userPrompt = `Сообщение бота: "${message}"
Контекст стрима: ${contextSummary?.slice(0, 300) || "нет данных"}`;

    let scoreText: string | null = null;

    if (openaiApiKey) {
      const client = new OpenAI({ apiKey: openaiApiKey });
      const res = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: SCORE_PROMPT },
          { role: "user", content: userPrompt },
        ],
        max_tokens: 150,
        temperature: 0.1,
      });
      scoreText = res.choices[0]?.message?.content?.trim() ?? null;
    } else if (geminiApiKey) {
      const genAI = new GoogleGenerativeAI(geminiApiKey);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const res = await model.generateContent(`${SCORE_PROMPT}\n\n${userPrompt}`);
      scoreText = res.response.text().trim();
    }

    if (!scoreText) return;

    const breakdown = await parseScoreResponse(scoreText);
    if (!breakdown) return;

    await db
      .update(botMessagesTable)
      .set({
        qualityScore: breakdown.overall,
        qualityBreakdown: JSON.stringify(breakdown),
      })
      .where(eq(botMessagesTable.id, messageId));

    logger.info({ messageId, score: breakdown.overall }, "Message quality scored");
  } catch (err) {
    logger.warn({ err, messageId }, "Quality scoring failed (non-fatal)");
  }
}

export async function updatePatternEffectiveness(
  patternContent: string,
  qualityScore: number
): Promise<void> {
  try {
    const rows = await db
      .select({ id: chatPatternsTable.id, qualityScore: chatPatternsTable.qualityScore, effectivenessCount: chatPatternsTable.effectivenessCount })
      .from(chatPatternsTable)
      .where(eq(chatPatternsTable.content, patternContent))
      .limit(1);

    if (!rows[0]) return;

    const existing = rows[0];
    const newCount = existing.effectivenessCount + 1;
    const alpha = 0.3;
    const newQuality = existing.qualityScore * (1 - alpha) + qualityScore * alpha;

    await db
      .update(chatPatternsTable)
      .set({
        effectivenessCount: newCount,
        qualityScore: Math.round(newQuality * 10) / 10,
      })
      .where(eq(chatPatternsTable.id, existing.id));
  } catch (err) {
    logger.warn({ err }, "Pattern effectiveness update failed (non-fatal)");
  }
}

export async function decayOldPatterns(): Promise<void> {
  try {
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
    await db.execute(
      sql`UPDATE chat_patterns 
          SET quality_score = GREATEST(10, quality_score * 0.85)
          WHERE last_seen_at < ${fourteenDaysAgo}
            AND quality_score > 10`
    );
  } catch (err) {
    logger.warn({ err }, "Pattern decay failed (non-fatal)");
  }
}
