import { Router, type IRouter } from "express";
import { startBot, stopBot, getBotStatusPayload } from "../lib/bot-engine/orchestrator";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/bot/status", async (req, res): Promise<void> => {
  res.json(getBotStatusPayload());
});

router.post("/bot/start", async (req, res): Promise<void> => {
  try {
    await startBot();
    res.json(getBotStatusPayload());
  } catch (err) {
    req.log.error({ err }, "Failed to start bot");
    res.status(400).json({ error: String(err) });
  }
});

router.post("/bot/stop", async (req, res): Promise<void> => {
  try {
    await stopBot();
    res.json(getBotStatusPayload());
  } catch (err) {
    req.log.error({ err }, "Failed to stop bot");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
