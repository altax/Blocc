/**
 * Corpus Writer — append-only JSONL накопитель сообщений чата.
 *
 * Формат JSONL (JSON Lines): каждая строка = одно сообщение = один JSON-объект.
 * Стандарт индустрии для ML-датасетов — именно такой формат используют OpenAI,
 * Hugging Face и пр. для хранения обучающих данных.
 *
 * Файл: data/corpus/messages.jsonl
 * Запись: append-only, никогда не перезаписывается целиком.
 * Архивация: при сбросе старый файл переименовывается в messages_TIMESTAMP.jsonl.
 */

import * as fs from "fs";
import * as path from "path";
import { logger } from "./logger";

export interface CorpusEntry {
  channel: string;   // стример (источник)
  user: string;      // ник в чате
  text: string;      // текст сообщения
  ts: string;        // ISO timestamp
  lang?: string;     // "ru" | "en" | "mixed" (опционально, добавляется классификатором)
  type?: string;     // тип паттерна (опционально)
  game?: string;     // "cs2" | "other" (опционально)
}

const CORPUS_DIR = path.resolve(process.cwd(), "data/corpus");
const CORPUS_FILE = path.join(CORPUS_DIR, "messages.jsonl");

let writeStream: fs.WriteStream | null = null;
let pendingLines = 0;
let totalLines = 0;

function ensureStream(): fs.WriteStream {
  if (writeStream && !writeStream.destroyed) return writeStream;

  if (!fs.existsSync(CORPUS_DIR)) {
    fs.mkdirSync(CORPUS_DIR, { recursive: true });
  }

  // Считаем сколько строк уже есть
  try {
    const existing = fs.readFileSync(CORPUS_FILE, "utf8");
    totalLines = existing.split("\n").filter((l) => l.trim()).length;
  } catch { totalLines = 0; }

  writeStream = fs.createWriteStream(CORPUS_FILE, { flags: "a", encoding: "utf8" });
  writeStream.on("error", (err) => logger.error({ err }, "Corpus write error"));
  logger.info({ total_existing: totalLines }, "Corpus writer opened");
  return writeStream;
}

/**
 * Записывает одно сообщение в корпус.
 * Не блокирующий — использует stream буфер.
 */
export function appendToCorpus(entry: CorpusEntry): void {
  const stream = ensureStream();
  const line = JSON.stringify(entry) + "\n";
  stream.write(line);
  totalLines++;
  pendingLines++;
  // Сбрасываем счётчик pending каждые 50 записей
  if (pendingLines >= 50) pendingLines = 0;
}

/**
 * Принудительный flush буфера на диск.
 */
export function flushCorpus(): Promise<void> {
  return new Promise((resolve) => {
    if (!writeStream || writeStream.destroyed) { resolve(); return; }
    writeStream.once("drain", resolve);
    if (!writeStream.writableNeedDrain) resolve();
  });
}

/**
 * Статистика корпуса.
 */
export function getCorpusStats(): {
  file: string;
  total_messages: number;
  size_bytes: number;
  exists: boolean;
} {
  try {
    const stat = fs.statSync(CORPUS_FILE);
    return { file: CORPUS_FILE, total_messages: totalLines, size_bytes: stat.size, exists: true };
  } catch {
    return { file: CORPUS_FILE, total_messages: 0, size_bytes: 0, exists: false };
  }
}

/**
 * Возвращает последние N строк корпуса для предпросмотра.
 */
export function previewCorpus(limit = 50): CorpusEntry[] {
  try {
    const content = fs.readFileSync(CORPUS_FILE, "utf8");
    const lines = content.split("\n").filter((l) => l.trim());
    return lines
      .slice(-limit)
      .map((l) => {
        try { return JSON.parse(l) as CorpusEntry; }
        catch { return null; }
      })
      .filter(Boolean) as CorpusEntry[];
  } catch {
    return [];
  }
}

/**
 * Архивирует текущий корпус и начинает новый.
 * Используется при сбросе базы обучения.
 * Возвращает путь к архивному файлу (или null если файла не было).
 */
export function archiveCorpus(): string | null {
  // Закрываем текущий stream
  if (writeStream && !writeStream.destroyed) {
    writeStream.end();
    writeStream = null;
  }
  totalLines = 0;
  pendingLines = 0;

  if (!fs.existsSync(CORPUS_FILE)) return null;

  const ts = new Date().toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
  const archivePath = path.join(CORPUS_DIR, `messages_${ts}.jsonl`);
  fs.renameSync(CORPUS_FILE, archivePath);
  logger.info({ archivePath }, "Corpus archived");
  return archivePath;
}

/**
 * Полный сброс: архивирует корпус, удаляет все сессии, очищает accumulator в памяти.
 */
export function resetCorpus(): { archived_to: string | null } {
  const archived_to = archiveCorpus();
  return { archived_to };
}
