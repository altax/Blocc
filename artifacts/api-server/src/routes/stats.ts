import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botLogsTable, botMessagesTable, chatPatternsTable } from "@workspace/db";
import { eq, gte, sql, desc } from "drizzle-orm";
import { getUptimeSeconds } from "../lib/bot-state";

const router: IRouter = Router();

router.get("/stats", async (req, res): Promise<void> => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [totalMessages] = await db
    .select({ count: sql<number>`count(*)` })
    .from(botMessagesTable);

  const [messagesToday] = await db
    .select({ count: sql<number>`count(*)` })
    .from(botMessagesTable)
    .where(gte(botMessagesTable.createdAt, today));

  const [totalPatterns] = await db
    .select({ count: sql<number>`count(*)` })
    .from(chatPatternsTable);

  const channelsResult = await db
    .selectDistinct({ channel: chatPatternsTable.sourceChannel })
    .from(chatPatternsTable);

  // Average response delay from logs metadata
  const sentLogs = await db
    .select({ metadata: botLogsTable.metadata })
    .from(botLogsTable)
    .where(eq(botLogsTable.type, "message_sent"))
    .limit(100);

  let totalDelay = 0;
  let delayCount = 0;
  for (const log of sentLogs) {
    if (log.metadata) {
      try {
        const meta = JSON.parse(log.metadata);
        if (typeof meta.delay === "number") {
          totalDelay += meta.delay / 1000;
          delayCount++;
        }
      } catch {}
    }
  }

  // Most common trigger type
  const triggerRows = await db
    .select({
      trigger: botMessagesTable.triggerType,
      count: sql<number>`count(*)`,
    })
    .from(botMessagesTable)
    .groupBy(botMessagesTable.triggerType)
    .orderBy(desc(sql`count(*)`))
    .limit(1);

  res.json({
    total_messages_sent: Number(totalMessages?.count ?? 0),
    messages_today: Number(messagesToday?.count ?? 0),
    total_patterns_learned: Number(totalPatterns?.count ?? 0),
    channels_learned_from: channelsResult.length,
    uptime_hours: Math.round(getUptimeSeconds() / 36) / 100,
    avg_response_delay_seconds: delayCount > 0 ? Math.round(totalDelay / delayCount * 10) / 10 : 0,
    most_common_trigger: triggerRows[0]?.trigger ?? null,
  });
});

export default router;
