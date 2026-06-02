/**
 * Session Memory — долгосрочная память о текущей сессии.
 * Отслеживает дугу сессии, заметные моменты, личность чата,
 * и что бот уже говорил чтобы не повторяться стратегически.
 */

export type ChatPersonality = "active" | "passive" | "toxic" | "wholesome" | "mixed";
export type BotMood = "hyped" | "chill" | "tense" | "tilted" | "supportive";

export interface NotableMoment {
  timestamp: number;
  type: string;
  description: string;
  intensity: number;
  botReacted: boolean;
}

export interface StreamerNote {
  timestamp: number;
  quote: string; // что сказал стример
  type: "funny" | "tilt" | "hype" | "question" | "info";
}

export interface SessionMemory {
  sessionId: string;
  channel: string;
  startedAt: number;
  notableMoments: NotableMoment[];
  streamerNotes: StreamerNote[];
  botMood: BotMood;
  chatPersonality: ChatPersonality;

  // Статистика сессии
  messagesSent: number;
  avgQualityScore: number;
  qualitySamples: number[];

  // Темы которые бот уже упоминал — не повторять
  usedTopics: string[];

  // Лучшие сообщения сессии (для обучения)
  topMessages: Array<{ message: string; quality: number }>;

  // Паттерны которые сработали хорошо этой сессии
  effectivePatternTypes: string[];
}

let session: SessionMemory | null = null;

function makeId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export function startSession(channel: string): void {
  session = {
    sessionId: makeId(),
    channel,
    startedAt: Date.now(),
    notableMoments: [],
    streamerNotes: [],
    botMood: "chill",
    chatPersonality: "mixed",
    messagesSent: 0,
    avgQualityScore: 70,
    qualitySamples: [],
    usedTopics: [],
    topMessages: [],
    effectivePatternTypes: [],
  };
}

export function endSession(): SessionMemory | null {
  const s = session;
  session = null;
  return s;
}

export function getSession(): SessionMemory | null {
  return session;
}

export function recordNotableMoment(
  type: string,
  description: string,
  intensity: number,
  botReacted: boolean
): void {
  if (!session) return;
  session.notableMoments.push({
    timestamp: Date.now(),
    type,
    description: description.slice(0, 150),
    intensity,
    botReacted,
  });
  // Хранить только последние 50 моментов
  if (session.notableMoments.length > 50) {
    session.notableMoments.shift();
  }
}

export function recordStreamerNote(quote: string, type: StreamerNote["type"]): void {
  if (!session) return;

  // Не добавлять дубли
  const recent = session.streamerNotes.slice(-10);
  if (recent.some((n) => n.quote.includes(quote.slice(0, 20)))) return;

  session.streamerNotes.push({
    timestamp: Date.now(),
    quote: quote.slice(0, 200),
    type,
  });
  if (session.streamerNotes.length > 30) {
    session.streamerNotes.shift();
  }
}

export function recordBotMessage(message: string, qualityScore?: number): void {
  if (!session) return;
  session.messagesSent++;

  if (qualityScore !== undefined) {
    session.qualitySamples.push(qualityScore);
    if (session.qualitySamples.length > 50) session.qualitySamples.shift();
    const sum = session.qualitySamples.reduce((a, b) => a + b, 0);
    session.avgQualityScore = Math.round(sum / session.qualitySamples.length);

    // Сохраняем топ сообщения
    if (qualityScore >= 75) {
      session.topMessages.push({ message, quality: qualityScore });
      session.topMessages.sort((a, b) => b.quality - a.quality);
      if (session.topMessages.length > 10) session.topMessages.pop();
    }
  }

  // Обновляем настроение бота на основе последних quality scores
  updateBotMood();
}

function updateBotMood(): void {
  if (!session) return;
  const recent = session.qualitySamples.slice(-10);
  if (recent.length === 0) return;
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

  if (avg >= 80) session.botMood = "hyped";
  else if (avg >= 70) session.botMood = "chill";
  else if (avg >= 60) session.botMood = "supportive";
  else session.botMood = "tense";
}

export function recordUsedTopic(topic: string): void {
  if (!session) return;
  if (!session.usedTopics.includes(topic)) {
    session.usedTopics.push(topic);
    if (session.usedTopics.length > 30) session.usedTopics.shift();
  }
}

export function recordEffectivePatternType(patternType: string, quality: number): void {
  if (!session || quality < 75) return;
  if (!session.effectivePatternTypes.includes(patternType)) {
    session.effectivePatternTypes.push(patternType);
  }
}

/**
 * Обновляет наблюдение о личности чата на основе поведения
 */
export function updateChatPersonality(msgCount: number, toxicCount: number, hypeCount: number): void {
  if (!session) return;
  if (msgCount < 10) return;

  const toxicRatio = toxicCount / msgCount;
  const hypeRatio = hypeCount / msgCount;

  if (toxicRatio > 0.3) session.chatPersonality = "toxic";
  else if (hypeRatio > 0.4) session.chatPersonality = "active";
  else if (msgCount < 5) session.chatPersonality = "passive";
  else session.chatPersonality = "wholesome";
}

/**
 * Строит описание сессии для инъекции в промпт
 */
export function getSessionContextString(): string {
  if (!session) return "";

  const parts: string[] = [];
  const duration = Math.floor((Date.now() - session.startedAt) / 60_000);

  parts.push(`Сессия: ${duration} минут на ${session.channel}`);
  parts.push(`Настроение бота: ${session.botMood} | Чат: ${session.chatPersonality}`);
  parts.push(`Отправлено ${session.messagesSent} сообщений, средняя оценка: ${session.avgQualityScore}/100`);

  // Заметные моменты последних 5 минут
  const recentMoments = session.notableMoments
    .filter((m) => m.timestamp > Date.now() - 5 * 60_000)
    .slice(-3);
  if (recentMoments.length > 0) {
    parts.push(`Недавние события: ${recentMoments.map((m) => m.type).join(", ")}`);
  }

  // Что стример говорил недавно
  const recentQuotes = session.streamerNotes
    .filter((n) => n.timestamp > Date.now() - 3 * 60_000)
    .slice(-2);
  if (recentQuotes.length > 0) {
    parts.push(`Стример недавно: ${recentQuotes.map((n) => `"${n.quote}"`).join("; ")}`);
  }

  // Темы которые уже использовали (чтобы не повторяться)
  if (session.usedTopics.length > 0) {
    parts.push(`Уже упоминал: ${session.usedTopics.slice(-5).join(", ")}`);
  }

  return parts.join("\n");
}

/**
 * Определяет тип промпт-инструкций на основе настроения
 */
export function getMoodInstruction(): string {
  if (!session) return "";

  switch (session.botMood) {
    case "hyped":
      return "Ты на кайфе — последние сообщения зашли хорошо. Пиши с энергией, можно эмоуты.";
    case "tense":
      return "Атмосфера напряжённая. Пиши коротко и по делу, без лишних слов.";
    case "tilted":
      return "Ситуация сложная. Можно выразить лёгкое разочарование — это по-человечески.";
    case "supportive":
      return "Поддержи стримера — подбадривающее или нейтральное сообщение.";
    default:
      return "";
  }
}
