import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { GetPatternsQueryParams, LearnFromChannelBody, BulkLearnFromStreamersBody } from "@workspace/api-zod";
import { collectPatternsFromChannel, bulkLearnFromStreamers, getPresetCS2Channels } from "../lib/bot-engine/pattern-learner";
import { RU_CS2_STREAMERS } from "../lib/cs2-ru-streamers";

const router: IRouter = Router();

router.get("/patterns", async (req, res): Promise<void> => {
  const parsed = GetPatternsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 100 } = parsed.data;

  const rows = await db
    .select()
    .from(chatPatternsTable)
    .orderBy(desc(chatPatternsTable.frequency))
    .limit(limit ?? 100);

  res.json(
    rows.map((r) => ({
      id: r.id,
      source_channel: r.sourceChannel,
      pattern_type: r.patternType,
      content: r.content,
      frequency: r.frequency,
      language: r.language,
      game: r.game,
      created_at: r.createdAt.toISOString(),
    }))
  );
});

router.post("/patterns", async (req, res): Promise<void> => {
  const parsed = LearnFromChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { channel, message_count = 500 } = parsed.data;

  res.json({ success: true, patterns_found: 0, channel });

  collectPatternsFromChannel(channel, message_count)
    .then((count) => req.log.info({ channel, count }, "Pattern learning complete"))
    .catch((err) => req.log.error({ err, channel }, "Pattern learning failed"));
});

router.delete("/patterns", async (req, res): Promise<void> => {
  const result = await db.delete(chatPatternsTable).returning({ id: chatPatternsTable.id });
  res.json({ deleted: result.length });
});

router.post("/patterns/bulk-learn", async (req, res): Promise<void> => {
  const parsed = BulkLearnFromStreamersBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const channels = parsed.data.channels?.length
    ? parsed.data.channels
    : getPresetCS2Channels();

  const msgCount = parsed.data.message_count_per_channel ?? 300;

  res.json({ success: true, channels_queued: channels, total_channels: channels.length });

  bulkLearnFromStreamers(channels, msgCount)
    .then(() => req.log.info({ channels }, "Bulk learning complete"))
    .catch((err) => req.log.error({ err }, "Bulk learning failed"));
});

router.get("/patterns/presets", async (req, res): Promise<void> => {
  res.json(RU_CS2_STREAMERS);
});

export default router;
