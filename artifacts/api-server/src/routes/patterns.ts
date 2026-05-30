import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { GetPatternsQueryParams, LearnFromChannelBody } from "@workspace/api-zod";
import { collectPatternsFromChannel } from "../lib/bot-engine/pattern-learner";

const router: IRouter = Router();

router.get("/patterns", async (req, res): Promise<void> => {
  const parsed = GetPatternsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 50 } = parsed.data;

  const rows = await db
    .select()
    .from(chatPatternsTable)
    .orderBy(desc(chatPatternsTable.frequency))
    .limit(limit ?? 50);

  res.json(
    rows.map((r) => ({
      id: r.id,
      source_channel: r.sourceChannel,
      pattern_type: r.patternType,
      content: r.content,
      frequency: r.frequency,
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

  // Start collection in background, respond immediately
  res.json({ success: true, patterns_found: 0, channel });

  collectPatternsFromChannel(channel, message_count).then((count) => {
    req.log.info({ channel, count }, "Pattern learning complete");
  }).catch((err) => {
    req.log.error({ err, channel }, "Pattern learning failed");
  });
});

export default router;
