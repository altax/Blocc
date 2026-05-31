import { Router, type IRouter } from "express";
import { scheduler } from "../lib/auto-scheduler";

const router: IRouter = Router();

router.get("/scheduler/status", async (req, res): Promise<void> => {
  res.json(scheduler.getStatus());
});

router.post("/scheduler/start", async (req, res): Promise<void> => {
  const {
    check_interval_hours,
    min_collection_interval_hours,
    messages_per_channel,
    detection_window_seconds,
  } = req.body ?? {};

  scheduler.start({
    checkIntervalMs:       check_interval_hours         ? check_interval_hours * 3_600_000 : undefined,
    minCollectionIntervalMs: min_collection_interval_hours ? min_collection_interval_hours * 3_600_000 : undefined,
    messagesPerChannel:    messages_per_channel          ?? undefined,
    detectionWindowMs:     detection_window_seconds      ? detection_window_seconds * 1000 : undefined,
  });

  res.json(scheduler.getStatus());
});

router.post("/scheduler/stop", async (req, res): Promise<void> => {
  scheduler.stop();
  res.json(scheduler.getStatus());
});

router.post("/scheduler/run-now", async (req, res): Promise<void> => {
  res.json({ started: true, message: "Detection running, check /api/scheduler/status for results" });

  scheduler.runNow()
    .then((results) => req.log.info({ results }, "Manual scheduler run complete"))
    .catch((err) => req.log.error({ err }, "Manual scheduler run failed"));
});

export default router;
