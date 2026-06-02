/**
 * Chat Hype Detector — анализирует IRC чат в реальном времени.
 * Обнаруживает "горячие" моменты: спам одного слова, пики активности,
 * эмоут-штормы. Когда hype high → оркестратор реагирует немедленно.
 */

export type HypeEventType = "velocity_spike" | "topic_cluster" | "emoji_storm" | "question_storm";

export interface HypeEvent {
  timestamp: number;
  type: HypeEventType;
  intensity: number; // 0-10
  triggerWords: string[];
}

export interface HypeState {
  currentLevel: number; // 0-10
  recentEvents: HypeEvent[];
  lastSpikeAt: number;
  isHot: boolean; // true если hype > 6 за последние 20 секунд
  dominantTopic: string | null; // что сейчас обсуждают в чате
  chatVelocity: number; // сообщений в секунду
}

interface TimestampedMessage {
  timestamp: number;
  message: string;
  user: string;
}

const WINDOW_MS = 30_000; // 30-секундное окно
const HOT_THRESHOLD = 6;
const HOT_DURATION_MS = 20_000;

const messageBuffer: TimestampedMessage[] = [];
let lastHypeState: HypeState = {
  currentLevel: 0,
  recentEvents: [],
  lastSpikeAt: 0,
  isHot: false,
  dominantTopic: null,
  chatVelocity: 0,
};

// Ключевые эмоуты и слова, указывающие на хайп
const HYPE_EMOTES = new Set([
  "KEKW", "PogChamp", "Pog", "OMEGALUL", "LUL", "LULW",
  "monkaS", "monkaW", "EZ", "POGGERS", "GachiGASM", "pepega",
  "FeelsGoodMan", "FeelsBadMan", "copium", "Sadge",
  "PauseChamp", "catJAM", "HYPERS", "POGGIES",
]);

const HYPE_WORDS_RU = new Set([
  "ору", "орнул", "лол", "кек", "кекв", "топ", "красава", "зачем",
  "пик", "блин", "да ладно", "серьёзно", "нееее", "вп", "имба",
  "умер", "всё", "ваааа", "агааа", "ну и", "жиза",
]);

const CS2_MOMENT_WORDS = new Set([
  "ace", "эйс", "clutch", "клатч", "awp", "awper", "flash", "флеш",
  "knife", "ножик", "1v5", "1v4", "1v3", "bomb", "бомба",
  "win", "выиграл", "lose", "проиграл", "ez", "имба пуш",
]);

export function recordChatMessage(user: string, message: string): void {
  const now = Date.now();
  messageBuffer.push({ timestamp: now, message, user });

  // Чистим старые сообщения (старше 60с)
  const cutoff = now - 60_000;
  while (messageBuffer.length > 0 && messageBuffer[0]!.timestamp < cutoff) {
    messageBuffer.shift();
  }

  // Пересчитываем состояние хайпа
  recalcHype(now);
}

function recalcHype(now: number): void {
  const windowStart = now - WINDOW_MS;
  const recent = messageBuffer.filter((m) => m.timestamp >= windowStart);

  if (recent.length === 0) {
    lastHypeState = {
      currentLevel: 0,
      recentEvents: lastHypeState.recentEvents.filter((e) => e.timestamp > now - 60_000),
      lastSpikeAt: lastHypeState.lastSpikeAt,
      isHot: false,
      dominantTopic: null,
      chatVelocity: 0,
    };
    return;
  }

  const velocity = recent.length / (WINDOW_MS / 1000); // msgs per second
  const events: HypeEvent[] = [];

  // --- 1. Velocity spike ---
  // Норма для CS2 чата ~0.5-2 msg/sec, spike это 5+
  if (velocity > 5) {
    events.push({
      timestamp: now,
      type: "velocity_spike",
      intensity: Math.min(10, Math.round(velocity * 1.5)),
      triggerWords: [],
    });
  }

  // --- 2. Topic clustering — многие пишут одно и то же ---
  const wordFreq = new Map<string, number>();
  for (const { message } of recent) {
    const tokens = message.toLowerCase().split(/\s+/);
    const seen = new Set<string>();
    for (const token of tokens) {
      if (token.length < 2) continue;
      if (!seen.has(token)) {
        wordFreq.set(token, (wordFreq.get(token) ?? 0) + 1);
        seen.add(token);
      }
    }
  }

  const topWords = [...wordFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .filter(([word, count]) => {
      // Слово упоминается в 30%+ сообщений или это хайп-слово встречается 3+ раз
      const ratio = count / recent.length;
      return ratio >= 0.3 || (HYPE_EMOTES.has(word) && count >= 3) || (HYPE_WORDS_RU.has(word) && count >= 3);
    });

  if (topWords.length > 0) {
    const topWord = topWords[0]!;
    const ratio = topWord[1] / recent.length;
    const intensity = Math.min(10, Math.round(ratio * 20));
    events.push({
      timestamp: now,
      type: "topic_cluster",
      intensity,
      triggerWords: topWords.map(([w]) => w),
    });
  }

  // --- 3. Emoji storm ---
  const emojiMsgs = recent.filter(({ message }) => {
    const tokens = message.split(/\s+/);
    return tokens.some((t) => HYPE_EMOTES.has(t));
  });
  if (emojiMsgs.length > recent.length * 0.5 && emojiMsgs.length >= 5) {
    events.push({
      timestamp: now,
      type: "emoji_storm",
      intensity: Math.min(10, Math.round((emojiMsgs.length / recent.length) * 12)),
      triggerWords: [],
    });
  }

  // --- 4. Question storm (чат задаёт вопросы стримеру) ---
  const questionMsgs = recent.filter(({ message }) => message.includes("?"));
  if (questionMsgs.length >= 4) {
    events.push({
      timestamp: now,
      type: "question_storm",
      intensity: Math.min(6, questionMsgs.length),
      triggerWords: [],
    });
  }

  // --- Агрегируем итоговый уровень ---
  const maxEventIntensity = events.length > 0 ? Math.max(...events.map((e) => e.intensity)) : 0;

  // CS2-специфичные слова добавляют интенсивности
  const cs2Count = recent.filter(({ message }) =>
    message.split(/\s+/).some((w) => CS2_MOMENT_WORDS.has(w.toLowerCase()))
  ).length;
  const cs2Bonus = Math.min(3, Math.round(cs2Count / 2));

  const currentLevel = Math.min(10, maxEventIntensity + cs2Bonus);

  const prevEvents = lastHypeState.recentEvents.filter((e) => e.timestamp > now - 60_000);
  const allEvents = [...prevEvents, ...events].slice(-20);

  const isHot = currentLevel >= HOT_THRESHOLD && now - lastHypeState.lastSpikeAt > 10_000;
  const lastSpikeAt = isHot ? now : lastHypeState.lastSpikeAt;

  // Доминирующая тема
  const dominantTopic =
    topWords.length > 0
      ? topWords[0]![0]
      : null;

  lastHypeState = {
    currentLevel,
    recentEvents: allEvents,
    lastSpikeAt,
    isHot: currentLevel >= HOT_THRESHOLD && now - lastSpikeAt < HOT_DURATION_MS,
    dominantTopic,
    chatVelocity: Math.round(velocity * 10) / 10,
  };
}

export function getHypeState(): HypeState {
  return { ...lastHypeState };
}

export function resetHypeDetector(): void {
  messageBuffer.length = 0;
  lastHypeState = {
    currentLevel: 0,
    recentEvents: [],
    lastSpikeAt: 0,
    isHot: false,
    dominantTopic: null,
    chatVelocity: 0,
  };
}
