/**
 * Corpus API
 * GET  /api/corpus/stats    — размер, кол-во строк, существует ли файл
 * GET  /api/corpus/preview  — последние N строк для предпросмотра
 * POST /api/corpus/reset    — архивировать корпус + очистить DB + удалить сессии
 */

import { Router, type IRouter } from "express";
import * as fs from "fs";
import * as path from "path";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import {
  getCorpusStats,
  previewCorpus,
  resetCorpus,
} from "../lib/corpus-writer";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/corpus/stats", (_req, res): void => {
  res.json(getCorpusStats());
});

router.get("/corpus/preview", (req, res): void => {
  const limit = Math.min(parseInt(String(req.query.limit ?? "100"), 10), 500);
  res.json(previewCorpus(limit));
});

/**
 * POST /api/corpus/reset
 * 1. Архивирует messages.jsonl → messages_TIMESTAMP.jsonl
 * 2. Очищает таблицу chat_patterns в PostgreSQL
 * 3. Удаляет все файлы сессий из data/sessions/
 * Возвращает: кол-во удалённых паттернов, сессий, путь к архиву
 */
router.post("/corpus/reset", async (req, res): Promise<void> => {
  logger.info("Corpus reset initiated");

  // 1. Архивируем корпус
  const { archived_to } = resetCorpus();

  // 2. Очищаем DB
  const deleted = await db.delete(chatPatternsTable).returning({ id: chatPatternsTable.id });

  // 3. Удаляем файлы сессий
  const sessionsDir = path.resolve(process.cwd(), "data/sessions");
  let deletedSessions = 0;
  if (fs.existsSync(sessionsDir)) {
    const files = fs.readdirSync(sessionsDir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      try {
        fs.unlinkSync(path.join(sessionsDir, f));
        deletedSessions++;
      } catch { /* ignore */ }
    }
  }

  logger.info(
    { deleted_patterns: deleted.length, deleted_sessions: deletedSessions, archived_to },
    "Corpus reset complete"
  );

  res.json({
    success: true,
    deleted_patterns: deleted.length,
    deleted_sessions: deletedSessions,
    archived_corpus_to: archived_to,
    message: "База очищена. Корпус архивирован. Обучение начнётся заново.",
  });
});

export default router;
