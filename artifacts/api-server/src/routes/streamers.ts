import { Router, type IRouter } from "express";
import { listStreamers, loadAnalysis, loadPatterns, loadRawSamples } from "../lib/streamer-analyzer";
import { detectLiveChannels } from "../lib/live-detector";
import { collectPatternsFromChannel } from "../lib/bot-engine/pattern-learner";
import { RU_CS2_STREAMERS, getPresetChannels } from "../lib/cs2-ru-streamers";

const router: IRouter = Router();

// Список всех стримеров с файлами
router.get("/streamers", async (req, res): Promise<void> => {
  const files = listStreamers();
  const presetMap = new Map(RU_CS2_STREAMERS.map((s) => [s.channel, s]));

  const result = files.map((f) => ({
    ...f,
    display_name: presetMap.get(f.channel)?.displayName ?? f.channel,
    category: presetMap.get(f.channel)?.category ?? "unknown",
    description: presetMap.get(f.channel)?.description ?? "",
  }));

  res.json(result);
});

// Пресеты стримеров
router.get("/streamers/presets", async (req, res): Promise<void> => {
  res.json(RU_CS2_STREAMERS);
});

// Детектор живых каналов — 30-секундное IRC-окно
router.post("/streamers/detect-live", async (req, res): Promise<void> => {
  const channels: string[] = req.body?.channels ?? getPresetChannels(3);
  const windowMs: number = req.body?.window_ms ?? 30_000;

  // Отвечаем сразу, что детекция запущена — клиент должен polling'ить
  res.json({ started: true, channels, window_seconds: windowMs / 1000 });
});

// Синхронный детект — более медленный, возвращает результат
router.post("/streamers/detect-live-sync", async (req, res): Promise<void> => {
  const channels: string[] = req.body?.channels ?? getPresetChannels(3);
  const windowMs: number = Math.min(req.body?.window_ms ?? 30_000, 60_000);

  try {
    const results = await detectLiveChannels(channels, windowMs);
    res.json({ results, detected_at: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// Запустить сбор для конкретного канала
router.post("/streamers/:channel/collect", async (req, res): Promise<void> => {
  const { channel } = req.params;
  const messageCount: number = req.body?.message_count ?? 500;

  res.json({ started: true, channel, message_count: messageCount });

  collectPatternsFromChannel(channel, messageCount)
    .then((count) => req.log.info({ channel, count }, "Streamer collection complete"))
    .catch((err) => req.log.error({ err, channel }, "Streamer collection failed"));
});

// Получить анализ стримера
router.get("/streamers/:channel/analysis", async (req, res): Promise<void> => {
  const { channel } = req.params;
  const analysis = loadAnalysis(channel);
  if (!analysis) {
    res.status(404).json({ error: "No analysis found. Collect data first." });
    return;
  }
  res.json(analysis);
});

// Получить паттерны стримера из файла
router.get("/streamers/:channel/patterns", async (req, res): Promise<void> => {
  const { channel } = req.params;
  const patterns = loadPatterns(channel);
  if (!patterns) {
    res.status(404).json({ error: "No patterns file found." });
    return;
  }
  res.json(patterns);
});

// Получить raw семплы
router.get("/streamers/:channel/samples", async (req, res): Promise<void> => {
  const { channel } = req.params;
  const samples = loadRawSamples(channel);
  if (!samples) {
    res.status(404).json({ error: "No raw samples file found." });
    return;
  }
  res.json(samples);
});

export default router;
