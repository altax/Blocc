/**
 * Кольцевой буфер событий обучения ИИ.
 * Каждое входящее сообщение из IRC оставляет след —
 * было ли оно классифицировано, стало паттерном, обновило частоту.
 */

export type LearningEventType =
  | "msg_classified"   // сообщение распознано и добавлено в аккумулятор
  | "pattern_new"      // новый уникальный паттерн обнаружен
  | "pattern_updated"  // частота существующего паттерна повысилась
  | "batch_flushed";   // накопленные паттерны записаны в БД

export interface LearningEvent {
  id: string;
  ts: string;
  channel: string;
  type: LearningEventType;
  msg?: { user: string; text: string };
  classification?: { pattern_type: string; lang: string; game: string };
  pattern?: { content: string; pattern_type: string; frequency: number; is_new: boolean };
  batch_stats?: { processed: number; saved: number };
}

const MAX_EVENTS = 500;
const ring: LearningEvent[] = [];
let idCounter = 0;

export function emitLearningEvent(e: Omit<LearningEvent, "id" | "ts">): LearningEvent {
  const event: LearningEvent = {
    id: String(++idCounter),
    ts: new Date().toISOString(),
    ...e,
  };
  ring.push(event);
  if (ring.length > MAX_EVENTS) ring.splice(0, ring.length - MAX_EVENTS);
  return event;
}

export function getRecentEvents(limit = 200): LearningEvent[] {
  return ring.slice(-limit);
}

export function getEventsSince(id: string, limit = 200): LearningEvent[] {
  const idx = ring.findLastIndex((e) => e.id === id);
  if (idx === -1) return ring.slice(-limit);
  return ring.slice(idx + 1, idx + 1 + limit);
}

export interface LearningStats {
  total_processed: number;
  total_new_patterns: number;
  total_updated_patterns: number;
  total_batches_flushed: number;
  active_channels: string[];
  per_channel: Record<string, { processed: number; new_patterns: number; updated: number }>;
}

const statsMap = new Map<string, { processed: number; new_patterns: number; updated: number }>();
let globalProcessed = 0;
let globalNew = 0;
let globalUpdated = 0;
let globalFlushes = 0;

export function recordStats(
  channel: string,
  type: "processed" | "new" | "updated" | "flush"
): void {
  if (!statsMap.has(channel)) statsMap.set(channel, { processed: 0, new_patterns: 0, updated: 0 });
  const s = statsMap.get(channel)!;
  if (type === "processed") { s.processed++; globalProcessed++; }
  else if (type === "new") { s.new_patterns++; globalNew++; }
  else if (type === "updated") { s.updated++; globalUpdated++; }
  else if (type === "flush") globalFlushes++;
}

export function getLearningStats(): LearningStats {
  const recentChannels = new Set(
    ring.slice(-200).map((e) => e.channel)
  );
  return {
    total_processed: globalProcessed,
    total_new_patterns: globalNew,
    total_updated_patterns: globalUpdated,
    total_batches_flushed: globalFlushes,
    active_channels: [...recentChannels],
    per_channel: Object.fromEntries(statsMap),
  };
}
