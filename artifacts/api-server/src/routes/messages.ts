import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botMessagesTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { GetMessagesQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/messages", async (req, res): Promise<void> => {
  const parsed = GetMessagesQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 50 } = parsed.data;

  const rows = await db
    .select()
    .from(botMessagesTable)
    .orderBy(desc(botMessagesTable.createdAt))
    .limit(limit ?? 50);

  res.json(
    rows.map((r) => ({
      id: r.id,
      channel: r.channel,
      message: r.message,
      trigger_type: r.triggerType,
      context_summary: r.contextSummary,
      created_at: r.createdAt.toISOString(),
    }))
  );
});

export default router;
