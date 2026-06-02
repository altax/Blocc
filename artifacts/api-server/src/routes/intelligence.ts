import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botMessagesTable, chatPatternsTable, botReflectionsTable, botSettingsTable } from "@workspace/db";
import { desc, isNotNull, avg, sql, gte, count } from "drizzle-orm";
import { runReflection } from "../lib/bot-engine/reflection-engine";
import { getGameState } from "../lib/bot-engine/game-state-machine";
import { getHypeState } from "../lib/bot-engine/chat-hype-detector";
import { getSession } from "../lib/bot-engine/session-memory";

const router: IRouter = Router();

router.get("/intelligence/metrics", async (req, res): Promise<void> => {
  try {
    const [totalMsgs] = await db.select({ count: count() }).from(botMessagesTable);
    const [scoredMsgs] = await db.select({ count: count() }).from(botMessagesTable).where(isNotNull(botMessagesTable.qualityScore));
    const [avgQuality] = await db.select({ avg: avg(botMessagesTable.qualityScore) }).from(botMessagesTable).where(isNotNull(botMessagesTable.qualityScore));

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [avgQualityWeek] = await db
      .select({ avg: avg(botMessagesTable.qualityScore) })
      .from(botMessagesTable)
      .where(gte(botMessagesTable.createdAt, sevenDaysAgo));

    const [totalPatterns] = await db.select({ count: count() }).from(chatPatternsTable);
    const [avgPatternQuality] = await db.select({ avg: avg(chatPatternsTable.qualityScore) }).from(chatPatternsTable);

    const topPatterns = await db
      .select({
        content: chatPatternsTable.content,
        qualityScore: chatPatternsTable.qualityScore,
        frequency: chatPatternsTable.frequency,
        patternType: chatPatternsTable.patternType,
        effectivenessCount: chatPatternsTable.effectivenessCount,
      })
      .from(chatPatternsTable)
      .orderBy(desc(sql`quality_score * LN(frequency + 1)`))
      .limit(10);

    const worstPatterns = await db
      .select({
        content: chatPatternsTable.content,
        qualityScore: chatPatternsTable.qualityScore,
        frequency: chatPatternsTable.frequency,
      })
      .from(chatPatternsTable)
      .orderBy(chatPatternsTable.qualityScore)
      .limit(5);

    const [reflectionsCount] = await db.select({ count: count() }).from(botReflectionsTable);

    res.json({
      total_messages: Number(totalMsgs?.count ?? 0),
      scored_messages: Number(scoredMsgs?.count ?? 0),
      avg_quality: avgQuality?.avg ? Math.round(Number(avgQuality.avg) * 10) / 10 : null,
      avg_quality_week: avgQualityWeek?.avg ? Math.round(Number(avgQualityWeek.avg) * 10) / 10 : null,
      total_patterns: Number(totalPatterns?.count ?? 0),
      avg_pattern_quality: avgPatternQuality?.avg ? Math.round(Number(avgPatternQuality.avg) * 10) / 10 : null,
      top_patterns: topPatterns,
      worst_patterns: worstPatterns,
      total_reflections: Number(reflectionsCount?.count ?? 0),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/intelligence/quality-trend", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(100, Number(req.query.limit) || 50);
    const rows = await db
      .select({
        id: botMessagesTable.id,
        message: botMessagesTable.message,
        qualityScore: botMessagesTable.qualityScore,
        qualityBreakdown: botMessagesTable.qualityBreakdown,
        triggerType: botMessagesTable.triggerType,
        createdAt: botMessagesTable.createdAt,
      })
      .from(botMessagesTable)
      .where(isNotNull(botMessagesTable.qualityScore))
      .orderBy(botMessagesTable.createdAt)
      .limit(limit);

    res.json(rows.map((r) => ({
      ...r,
      qualityBreakdown: r.qualityBreakdown ? JSON.parse(r.qualityBreakdown) : null,
    })));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/intelligence/reflections", async (req, res): Promise<void> => {
  try {
    const limit = Math.min(50, Number(req.query.limit) || 10);
    const rows = await db
      .select()
      .from(botReflectionsTable)
      .orderBy(desc(botReflectionsTable.createdAt))
      .limit(limit);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post("/intelligence/reflect", async (req, res): Promise<void> => {
  try {
    const settingsRows = await db.select().from(botSettingsTable).limit(1);
    const settings = settingsRows[0];
    if (!settings?.openaiApiKey && !settings?.geminiApiKey) {
      res.status(400).json({ error: "Нет API ключей в настройках" });
      return;
    }
    const result = await runReflection(settings.openaiApiKey, settings.geminiApiKey || undefined, "manual");
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/intelligence/dna", async (req, res): Promise<void> => {
  try {
    const recentMessages = await db
      .select({ message: botMessagesTable.message, qualityBreakdown: botMessagesTable.qualityBreakdown })
      .from(botMessagesTable)
      .where(isNotNull(botMessagesTable.qualityScore))
      .orderBy(desc(botMessagesTable.createdAt))
      .limit(50);

    if (recentMessages.length === 0) {
      res.json({ naturalness: 50, contextFit: 50, styleMatch: 50, brevity: 50, overall: 50, sampleSize: 0 });
      return;
    }

    let n = 0, cf = 0, sm = 0, br = 0, ov = 0, count = 0;
    for (const row of recentMessages) {
      if (!row.qualityBreakdown) continue;
      try {
        const bd = JSON.parse(row.qualityBreakdown);
        n += Number(bd.naturalness) || 0;
        cf += Number(bd.context_fit) || 0;
        sm += Number(bd.style_match) || 0;
        br += Number(bd.brevity) || 0;
        ov += Number(bd.overall) || 0;
        count++;
      } catch {}
    }

    if (count === 0) {
      res.json({ naturalness: 50, contextFit: 50, styleMatch: 50, brevity: 50, overall: 50, sampleSize: 0 });
      return;
    }

    res.json({
      naturalness: Math.round(n / count),
      contextFit: Math.round(cf / count),
      styleMatch: Math.round(sm / count),
      brevity: Math.round(br / count),
      overall: Math.round(ov / count),
      sampleSize: count,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/intelligence/messages-per-day", async (req, res): Promise<void> => {
  try {
    const rows = await db.execute(sql`
      SELECT 
        DATE(created_at AT TIME ZONE 'UTC') as date,
        COUNT(*) as total,
        ROUND(AVG(quality_score)::numeric, 1) as avg_quality
      FROM bot_messages
      WHERE created_at >= NOW() - INTERVAL '14 days'
      GROUP BY DATE(created_at AT TIME ZONE 'UTC')
      ORDER BY date ASC
    `);
    res.json(rows.rows ?? rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

/**
 * Реальное время: game state, hype level, session memory.
 * Опрашивается каждые 3 секунды с дашборда для live индикаторов.
 */
router.get("/intelligence/live", async (req, res): Promise<void> => {
  try {
    const gs = getGameState();
    const hs = getHypeState();
    const session = getSession();

    res.json({
      game_state: {
        round_phase: gs.roundPhase,
        moment_type: gs.momentType,
        moment_intensity: gs.momentIntensity,
        session_mood: gs.sessionMood,
        ct_score: gs.ctScore,
        t_score: gs.tScore,
        map: gs.map ?? null,
        is_clutch: gs.isClutch,
        bomb_planted: gs.isBombPlanted,
        consecutive_losses: gs.consecutiveLosses,
        consecutive_wins: gs.consecutiveWins,
        last_event: gs.lastEventDescription,
      },
      hype: {
        level: hs.currentLevel,
        is_hot: hs.isHot,
        velocity: hs.chatVelocity,
        dominant_topic: hs.dominantTopic,
        recent_event_types: hs.recentEvents.slice(-3).map((e) => e.type),
      },
      session: session ? {
        channel: session.channel,
        duration_minutes: Math.floor((Date.now() - session.startedAt) / 60_000),
        messages_sent: session.messagesSent,
        avg_quality: session.avgQualityScore,
        bot_mood: session.botMood,
        chat_personality: session.chatPersonality,
        notable_moments_count: session.notableMoments.length,
        top_messages: session.topMessages.slice(0, 3),
        effective_pattern_types: session.effectivePatternTypes,
      } : null,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
