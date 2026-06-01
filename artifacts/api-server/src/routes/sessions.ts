import { Router, type IRouter } from "express";
import {
  startSessionRecording,
  getActiveSession,
  getAllActiveSessions,
  listSavedSessions,
  loadSession,
  stopSession,
  registerStop,
} from "../lib/session-recorder";

const router: IRouter = Router();

// Список всех сохранённых сессий (опционально фильтр по каналу)
router.get("/sessions", (req, res): void => {
  const channel = typeof req.query.channel === "string" ? req.query.channel : undefined;
  const sessions = listSavedSessions(channel);
  res.json(sessions);
});

// Список активных (текущих) сессий
router.get("/sessions/active", (req, res): void => {
  const active = getAllActiveSessions().map((s) => ({
    channel: s.channel,
    started_at: s.started_at,
    status: s.status,
    message_count: s.message_count,
    game_name: s.game_name,
  }));
  res.json(active);
});

// Загрузить полную сессию из файла (с сообщениями)
router.get("/sessions/file/:file", (req, res): void => {
  const { file } = req.params;
  // Защита от path traversal
  if (file.includes("/") || file.includes("..")) {
    res.status(400).json({ error: "Invalid file name" });
    return;
  }
  const session = loadSession(file);
  if (!session) {
    res.status(404).json({ error: "Session file not found" });
    return;
  }
  res.json(session);
});

// Запустить запись сессии для канала
router.post("/sessions/:channel/start", (req, res): void => {
  const { channel } = req.params;

  const existing = getActiveSession(channel);
  if (existing) {
    res.status(409).json({
      error: "Session already recording for this channel",
      session: {
        channel: existing.channel,
        started_at: existing.started_at,
        message_count: existing.message_count,
      },
    });
    return;
  }

  const pollIntervalMs: number = req.body?.poll_interval_minutes
    ? req.body.poll_interval_minutes * 60 * 1000
    : 2 * 60 * 1000;

  const maxDurationMs: number = req.body?.max_duration_hours
    ? req.body.max_duration_hours * 60 * 60 * 1000
    : 8 * 60 * 60 * 1000;

  const { session, stop } = startSessionRecording(channel, { pollIntervalMs, maxDurationMs });
  registerStop(channel, stop);

  res.json({
    started: true,
    channel: session.channel,
    started_at: session.started_at,
    poll_interval_minutes: pollIntervalMs / 60000,
    max_duration_hours: maxDurationMs / 3600000,
    note: "Recording all chat messages. Session auto-stops when streamer goes offline or manually stopped.",
  });
});

// Остановить запись сессии вручную
router.post("/sessions/:channel/stop", (req, res): void => {
  const { channel } = req.params;
  const stopped = stopSession(channel);
  if (!stopped) {
    res.status(404).json({ error: "No active session for this channel" });
    return;
  }
  res.json({ stopped: true, channel });
});

// Текущий статус сессии канала (включая кол-во сообщений в реальном времени)
router.get("/sessions/:channel/status", (req, res): void => {
  const { channel } = req.params;
  const active = getActiveSession(channel);
  if (active) {
    res.json({
      channel: active.channel,
      started_at: active.started_at,
      status: active.status,
      message_count: active.message_count,
      game_name: active.game_name,
      finished_at: null,
    });
    return;
  }

  // Проверяем последнюю сохранённую сессию
  const saved = listSavedSessions(channel);
  if (saved.length > 0) {
    res.json(saved[0]);
    return;
  }

  res.status(404).json({ error: "No session found for this channel" });
});

// Получить сообщения активной сессии (с пагинацией)
router.get("/sessions/:channel/messages", (req, res): void => {
  const { channel } = req.params;
  const offset = parseInt(String(req.query.offset ?? "0"), 10);
  const limit = Math.min(parseInt(String(req.query.limit ?? "200"), 10), 1000);

  const active = getActiveSession(channel);
  if (active) {
    const slice = active.messages.slice(offset, offset + limit);
    res.json({
      channel: active.channel,
      status: "recording",
      total: active.message_count,
      offset,
      limit,
      messages: slice,
    });
    return;
  }

  // Пробуем найти последнюю сохранённую сессию и вернуть её сообщения
  const saved = listSavedSessions(channel);
  if (saved.length > 0) {
    const session = loadSession(saved[0].file);
    if (session) {
      const slice = session.messages.slice(offset, offset + limit);
      res.json({
        channel: session.channel,
        status: "finished",
        total: session.message_count,
        started_at: session.started_at,
        finished_at: session.finished_at,
        offset,
        limit,
        messages: slice,
      });
      return;
    }
  }

  res.status(404).json({ error: "No session or messages found for this channel" });
});

export default router;
