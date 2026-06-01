import * as net from "net";
import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";
import { getChannelGame } from "./game-detector";
import { processMessageForLearning, flushAccumulatorToDB } from "./bot-engine/pattern-learner";
import { appendToCorpus } from "./corpus-writer";

export interface SessionMessage {
  user: string;
  text: string;
  timestamp: string;
}

export interface LiveSession {
  channel: string;
  started_at: string;
  finished_at: string | null;
  status: "recording" | "finished" | "error";
  message_count: number;
  messages: SessionMessage[];
  game_name: string | null;
  stop_reason: string | null;
}

const DATA_ROOT = path.resolve(process.cwd(), "data/sessions");

function ensureDir(): void {
  if (!fs.existsSync(DATA_ROOT)) fs.mkdirSync(DATA_ROOT, { recursive: true });
}

// In-memory map of active sessions
const activeSessions = new Map<string, LiveSession>();

function sessionFilePath(channel: string, startedAt: string): string {
  const ts = startedAt.replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  return path.join(DATA_ROOT, `${channel.toLowerCase()}_${ts}.json`);
}

function saveSessionToDisk(session: LiveSession): void {
  ensureDir();
  const file = sessionFilePath(session.channel, session.started_at);
  fs.writeFileSync(file, JSON.stringify(session, null, 2), "utf8");
}

/** Запускает непрерывную запись всех сообщений чата стримера.
 *  Каждые `pollIntervalMs` мс проверяет через GQL жив ли стример.
 *  Автоматически останавливается когда стример уходит офлайн.
 */
export function startSessionRecording(
  channel: string,
  options: {
    pollIntervalMs?: number;
    maxDurationMs?: number;
  } = {}
): { session: LiveSession; stop: () => void } {
  const {
    pollIntervalMs = 2 * 60 * 1000,   // проверяем GQL каждые 2 минуты
    maxDurationMs = 8 * 60 * 60 * 1000, // максимум 8 часов
  } = options;

  const session: LiveSession = {
    channel: channel.toLowerCase(),
    started_at: new Date().toISOString(),
    finished_at: null,
    status: "recording",
    message_count: 0,
    messages: [],
    game_name: null,
    stop_reason: null,
  };

  activeSessions.set(channel.toLowerCase(), session);
  logger.info({ channel }, "Session recording started");

  let stopped = false;
  let socket: net.Socket | null = null;
  let buffer = "";
  let pollTimer: NodeJS.Timeout | null = null;
  let maxTimer: NodeJS.Timeout | null = null;

  const finish = (reason: string) => {
    if (stopped) return;
    stopped = true;

    session.finished_at = new Date().toISOString();
    session.status = "finished";
    session.stop_reason = reason;

    if (pollTimer) clearInterval(pollTimer);
    if (maxTimer) clearTimeout(maxTimer);

    try { socket?.destroy(); } catch { /* ignore */ }

    saveSessionToDisk(session);
    activeSessions.delete(channel.toLowerCase());

    // Финальный flush при завершении сессии
    flushAccumulatorToDB(channel).catch((err) =>
      logger.warn({ err, channel }, "Final learning flush failed on session end")
    );

    logger.info({ channel, reason, messages: session.message_count }, "Session recording finished");
  };

  // IRC-подключение
  socket = new net.Socket();
  socket.connect(6667, "irc.chat.twitch.tv", () => {
    socket!.write("PASS SCHMOOPIIE\r\n");
    socket!.write(`NICK justinfan${Math.floor(Math.random() * 99999)}\r\n`);
    socket!.write(`JOIN #${channel.toLowerCase()}\r\n`);
    logger.info({ channel }, "Session recorder IRC connected");
  });

  socket.on("data", (data) => {
    if (stopped) return;
    buffer += data.toString();
    const lines = buffer.split("\r\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("PING")) {
        socket?.write(`PONG${line.slice(4)}\r\n`);
      }
      const match = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
      if (match) {
        const [, user, text] = match;

        const ts = new Date().toISOString();

        // Непрерывное обучение: обрабатываем каждое сообщение немедленно
        processMessageForLearning(channel, user, text);

        // Append-only запись в корпус (JSONL) — каждое сырое сообщение без фильтров
        appendToCorpus({ channel, user, text, ts });

        // Фильтруем боты и команды для хранения в сессии
        if (!text.startsWith("!") && !(/https?:\/\//.test(text)) && text.length >= 2 && text.length <= 300) {
          session.messages.push({ user, text, timestamp: ts });
          session.message_count++;

          // Каждые 100 сообщений — flush аккумулятора в БД
          if (session.message_count % 100 === 0) {
            flushAccumulatorToDB(channel).catch((err) =>
              logger.warn({ err, channel }, "Incremental learning flush failed")
            );
          }
        }
      }
    }
  });

  socket.on("error", (err) => {
    logger.error({ err, channel }, "Session recorder IRC error");
    finish("irc_error");
  });

  socket.on("close", () => {
    if (!stopped) finish("irc_disconnected");
  });

  // Периодически проверяем GQL — если стример ушёл офлайн, завершаем сессию
  pollTimer = setInterval(async () => {
    if (stopped) return;
    try {
      const info = await getChannelGame(channel);
      if (info.game_name) session.game_name = info.game_name;

      if (!info.is_live) {
        logger.info({ channel }, "Session recorder: streamer went offline");
        finish("streamer_offline");
      }
    } catch (err) {
      logger.warn({ err, channel }, "Session recorder: GQL poll failed, continuing");
    }
  }, pollIntervalMs);

  // Максимальная длительность записи
  maxTimer = setTimeout(() => finish("max_duration_reached"), maxDurationMs);

  return { session, stop: () => finish("manual_stop") };
}

/** Возвращает текущую активную сессию для канала (если есть). */
export function getActiveSession(channel: string): LiveSession | null {
  return activeSessions.get(channel.toLowerCase()) ?? null;
}

/** Возвращает все активные сессии. */
export function getAllActiveSessions(): LiveSession[] {
  return Array.from(activeSessions.values());
}

/** Список сохранённых сессий на диске для канала. */
export function listSavedSessions(channel?: string): Array<{
  channel: string;
  started_at: string;
  finished_at: string | null;
  message_count: number;
  status: string;
  game_name: string | null;
  stop_reason: string | null;
  file: string;
}> {
  ensureDir();
  const files = fs.readdirSync(DATA_ROOT).filter((f) => f.endsWith(".json"));

  const results = [];
  for (const file of files) {
    if (channel && !file.startsWith(channel.toLowerCase() + "_")) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(DATA_ROOT, file), "utf8")) as LiveSession;
      results.push({
        channel: raw.channel,
        started_at: raw.started_at,
        finished_at: raw.finished_at,
        message_count: raw.message_count,
        status: raw.status,
        game_name: raw.game_name,
        stop_reason: raw.stop_reason,
        file,
      });
    } catch { /* ignore corrupt files */ }
  }

  return results.sort((a, b) => b.started_at.localeCompare(a.started_at));
}

/** Загружает полную сессию из файла. */
export function loadSession(file: string): LiveSession | null {
  ensureDir();
  const filePath = path.join(DATA_ROOT, file);
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as LiveSession;
  } catch {
    return null;
  }
}

// Stop-функции для внешнего управления
const stopFunctions = new Map<string, () => void>();

export function registerStop(channel: string, stop: () => void): void {
  stopFunctions.set(channel.toLowerCase(), stop);
}

export function stopSession(channel: string): boolean {
  const stop = stopFunctions.get(channel.toLowerCase());
  if (!stop) return false;
  stop();
  stopFunctions.delete(channel.toLowerCase());
  return true;
}
