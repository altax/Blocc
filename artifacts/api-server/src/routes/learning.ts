import { Router, type IRouter } from "express";
import { getRecentEvents, getLearningStats, getEventsSince } from "../lib/learning-events";
import { getAccumulatorPreview } from "../lib/bot-engine/pattern-learner";

const router: IRouter = Router();

/**
 * GET /api/learning/feed
 * Возвращает последние события обучения + статистику + состояние аккумулятора.
 * Параметр ?since=<id> — вернуть только события после указанного id.
 */
router.get("/learning/feed", (req, res): void => {
  const since = req.query.since as string | undefined;
  const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10), 500);

  const events = since
    ? getEventsSince(since, limit)
    : getRecentEvents(limit);

  res.json({
    events,
    stats: getLearningStats(),
    accumulator: getAccumulatorPreview(),
    server_time: new Date().toISOString(),
  });
});

export default router;
