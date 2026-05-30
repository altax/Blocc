import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botLogsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { GetLogsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/logs", async (req, res): Promise<void> => {
  const parsed = GetLogsQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { limit = 100, type } = parsed.data;

  let query = db
    .select()
    .from(botLogsTable)
    .orderBy(desc(botLogsTable.createdAt))
    .limit(limit ?? 100);

  const rows = await (type
    ? db
        .select()
        .from(botLogsTable)
        .where(eq(botLogsTable.type, type))
        .orderBy(desc(botLogsTable.createdAt))
        .limit(limit ?? 100)
    : query);

  res.json(
    rows.map((r) => ({
      id: r.id,
      type: r.type,
      content: r.content,
      metadata: r.metadata,
      created_at: r.createdAt.toISOString(),
    }))
  );
});

export default router;
