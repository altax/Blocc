/**
 * Stream Narrative — 60-минутная нарративная память стрима.
 *
 * Отслеживает дугу событий: что произошло, как менялось настроение,
 * ключевые моменты. События старше 15 минут сжимаются в текстовую сводку.
 * Итоговый нарратив инжектируется в промпт, давая боту полную историю
 * происходящего на стриме — а не только последние 5 минут.
 */

export type NarrativeEventType =
  | "game_moment"     // ace, clutch, win, loss — CS2 событие
  | "chat_reaction"   // чат взорвался
  | "streamer_speech" // стример сказал что-то важное
  | "bot_message"     // бот написал сообщение
  | "mood_shift";     // смена атмосферы (tilt → comeback и т.д.)

export interface NarrativeEvent {
  timestamp: number;
  type: NarrativeEventType;
  description: string;
  intensity: number;      // 0-10
  gotReaction?: boolean;  // для bot_message: получило реакции чата
}

interface ArcSegment {
  fromMinute: number;
  toMinute: number;
  summary: string;
}

const MAX_TIMELINE_EVENTS = 200;
const MAX_ARC_AGE_MS = 60 * 60 * 1000;
const COMPRESS_THRESHOLD_MS = 15 * 60 * 1000;
const COMPRESS_INTERVAL_MS = 10 * 60 * 1000;

let timeline: NarrativeEvent[] = [];
let arcSegments: ArcSegment[] = [];
let sessionStartTime = 0;
let lastCompressAt = 0;

export function startNarrative(channel: string): void {
  timeline = [];
  arcSegments = [];
  sessionStartTime = Date.now();
  lastCompressAt = Date.now();
}

export function resetNarrative(): void {
  timeline = [];
  arcSegments = [];
  sessionStartTime = 0;
  lastCompressAt = 0;
}

export function addNarrativeEvent(
  type: NarrativeEventType,
  description: string,
  intensity: number,
  gotReaction?: boolean
): void {
  if (sessionStartTime === 0) return;

  const now = Date.now();

  timeline.push({
    timestamp: now,
    type,
    description: description.slice(0, 200),
    intensity: Math.min(10, Math.max(0, intensity)),
    gotReaction,
  });

  if (timeline.length > MAX_TIMELINE_EVENTS) {
    timeline.shift();
  }

  const cutoff = now - MAX_ARC_AGE_MS;
  while (timeline.length > 0 && timeline[0]!.timestamp < cutoff) {
    timeline.shift();
  }

  if (now - lastCompressAt > COMPRESS_INTERVAL_MS) {
    compressOlderEvents();
  }
}

/**
 * Когда reaction-tracker подтверждает что сообщение бота получило реакции —
 * обновляем соответствующее событие в timeline.
 */
export function markBotMessageGotReaction(message: string): void {
  const cutoff = Date.now() - 60_000;
  for (let i = timeline.length - 1; i >= 0; i--) {
    const ev = timeline[i]!;
    if (ev.type === "bot_message" && ev.description === message && ev.timestamp >= cutoff) {
      ev.gotReaction = true;
      break;
    }
  }
}

/**
 * Сжимает события старше 15 минут в компактную текстовую дугу.
 * Это позволяет хранить историю целого часа не раздувая контекст.
 */
function compressOlderEvents(): void {
  const cutoff = Date.now() - COMPRESS_THRESHOLD_MS;
  const old = timeline.filter((e) => e.timestamp < cutoff);

  if (old.length < 3) {
    lastCompressAt = Date.now();
    return;
  }

  timeline = timeline.filter((e) => e.timestamp >= cutoff);

  const fromMinute = Math.floor((old[0]!.timestamp - sessionStartTime) / 60_000);
  const toMinute = Math.floor((old[old.length - 1]!.timestamp - sessionStartTime) / 60_000);

  const keyEvents = old
    .filter((e) => e.intensity >= 5)
    .slice(-6)
    .map((e) => e.description);

  const fallback = old.slice(-5).map((e) => e.description);
  const eventList = keyEvents.length >= 2 ? keyEvents : fallback;

  const goldenCount = old.filter((e) => e.type === "bot_message" && e.gotReaction).length;
  const goldenSuffix = goldenCount > 0 ? ` (бот ${goldenCount}× зашёл в чат)` : "";

  arcSegments.push({
    fromMinute,
    toMinute,
    summary: eventList.join("; ").slice(0, 300) + goldenSuffix,
  });

  if (arcSegments.length > 6) {
    arcSegments.shift();
  }

  lastCompressAt = Date.now();
}

/**
 * Строит нарративную строку для инъекции в промпт.
 * Структура: продолжительность → прошедшая дуга → последние события → что боту зашло.
 */
export function getNarrativeForPrompt(): string {
  if (sessionStartTime === 0 || (timeline.length === 0 && arcSegments.length === 0)) {
    return "";
  }

  const parts: string[] = [];
  const sessionMin = Math.floor((Date.now() - sessionStartTime) / 60_000);

  parts.push(`Стрим идёт ${sessionMin} мин.`);

  if (arcSegments.length > 0) {
    const arcText = arcSegments
      .slice(-3)
      .map((s) => `[${s.fromMinute}-${s.toMinute} мин]: ${s.summary}`)
      .join(" → ");
    parts.push(`История: ${arcText}`);
  }

  const recentCutoff = Date.now() - 15 * 60_000;
  const recent = timeline.filter((e) => e.timestamp >= recentCutoff);

  if (recent.length > 0) {
    const key = recent.filter((e) => e.intensity >= 4 || e.type === "bot_message").slice(-6);
    if (key.length > 0) {
      const recentText = key
        .map((e) => {
          const minAgo = Math.round((Date.now() - e.timestamp) / 60_000);
          const ago = minAgo === 0 ? "только что" : `${minAgo}мин назад`;
          const mark = e.gotReaction ? " ✓" : "";
          return `${ago}: ${e.description}${mark}`;
        })
        .join(" | ");
      parts.push(`Последние события: ${recentText}`);
    }
  }

  const goldenRecent = timeline
    .filter((e) => e.type === "bot_message" && e.gotReaction && e.timestamp > Date.now() - 30 * 60_000)
    .slice(-3);

  if (goldenRecent.length > 0) {
    const txt = goldenRecent.map((e) => `"${e.description}"`).join(", ");
    parts.push(`Твои слова которые зашли в чат: ${txt}`);
  }

  return parts.join("\n");
}

export function getRecentNarrativeEvents(limitMinutes = 15): NarrativeEvent[] {
  const cutoff = Date.now() - limitMinutes * 60_000;
  return timeline.filter((e) => e.timestamp >= cutoff);
}

export function getNarrativeIsActive(): boolean {
  return sessionStartTime > 0;
}
