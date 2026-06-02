/**
 * Reaction Tracker — отслеживает реакции чата на сообщения бота.
 *
 * Когда бот отправляет сообщение → ждём 45 секунд → анализируем активность чата.
 * Если получили реакции (эхо слов, эмоуты, всплеск активности) → callback.
 *
 * Это аналог RLHF: сообщения которые реально понравились людям попадают
 * в golden_bot_messages и получают приоритет в системном промпте.
 *
 * Сигналы реакции (суммируются, порог 25/100):
 *  - Эхо слов бота в чате в течение 45 сек (+15 за каждое совпадение)
 *  - Реакционные эмоуты после сообщения (+8 за эмоут-сообщение)
 *  - Русские реакционные слова (+10)
 *  - Всплеск активности чата x1.5 от фоновой (+20 + дополнительные сообщения)
 */

import { logger } from "../logger";

export interface PendingBotMessage {
  dbId: number | null;
  message: string;
  sentAt: number;
  contextSnapshot: string;
  momentType: string;
  triggerType: string;
  channel: string;
}

export type ReactionCallback = (
  pending: PendingBotMessage,
  reactionScore: number,
  reactionCount: number
) => Promise<void>;

const REACTION_EMOTES = new Set([
  "KEKW", "OMEGALUL", "LUL", "LULW", "PogChamp", "Pog", "POGGERS",
  "monkaS", "monkaW", "FeelsGoodMan", "FeelsBadMan", "copium",
  "Sadge", "pepega", "EZ", "GachiGASM", "HYPERS", "POGGIES",
]);

const RU_REACTION_WORDS = [
  "ору", "кек", "топ", "красава", "жиза", "вп", "збс",
  "лол", "кекв", "ахах", "орнул", "точно", "фактс", "правда",
  "ппц", "пф", "ну и", "да ладно",
];

interface TimestampedChatMessage {
  timestamp: number;
  user: string;
  message: string;
}

const chatWindow: TimestampedChatMessage[] = [];
const WINDOW_KEEP_MS = 5 * 60_000;
const MAX_WINDOW_SIZE = 1000;

const pendingMessages = new Map<string, PendingBotMessage>();
let onEvaluated: ReactionCallback | null = null;

export function setReactionCallback(cb: ReactionCallback): void {
  onEvaluated = cb;
}

/**
 * Вызывается из IRC-обработчика для каждого входящего сообщения чата.
 */
export function feedChatMessage(user: string, message: string): void {
  const now = Date.now();
  chatWindow.push({ timestamp: now, user, message });

  const cutoff = now - WINDOW_KEEP_MS;
  while (chatWindow.length > 0 && chatWindow[0]!.timestamp < cutoff) {
    chatWindow.shift();
  }
  if (chatWindow.length > MAX_WINDOW_SIZE) chatWindow.shift();
}

/**
 * Регистрируем только что отправленное сообщение бота.
 * Через 45 секунд автоматически оценим реакции.
 */
export function registerBotMessage(
  dbId: number | null,
  message: string,
  contextSnapshot: string,
  momentType: string,
  triggerType: string,
  channel: string
): void {
  const key = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  pendingMessages.set(key, {
    dbId,
    message,
    sentAt: Date.now(),
    contextSnapshot,
    momentType,
    triggerType,
    channel,
  });

  setTimeout(() => {
    evaluateReactions(key).catch((err) => {
      logger.warn({ err }, "Reaction evaluation failed (non-fatal)");
    });
  }, 45_000);
}

async function evaluateReactions(key: string): Promise<void> {
  const pending = pendingMessages.get(key);
  if (!pending) return;
  pendingMessages.delete(key);

  const { sentAt, message } = pending;
  const windowEnd = sentAt + 45_000;

  const windowMessages = chatWindow.filter(
    (m) => m.timestamp >= sentAt && m.timestamp <= windowEnd
  );

  if (windowMessages.length === 0) return;

  let reactionScore = 0;
  let reactionCount = 0;

  const botWords = new Set(
    message.toLowerCase().split(/\s+/).filter((w) => w.length >= 3)
  );

  for (const chatMsg of windowMessages) {
    const lower = chatMsg.message.toLowerCase();
    const tokens = lower.split(/\s+/);

    const echoCount = tokens.filter((t) => botWords.has(t)).length;
    if (echoCount >= 1) {
      reactionScore += 15 * Math.min(2, echoCount);
      reactionCount++;
    }

    const hasEmote = tokens.some((t) => REACTION_EMOTES.has(chatMsg.message.split(/\s+/)[tokens.indexOf(t)] ?? t));
    if (hasEmote) {
      reactionScore += 8;
    }

    const hasRuReaction = RU_REACTION_WORDS.some((w) => lower.includes(w));
    if (hasRuReaction) {
      reactionScore += 10;
    }
  }

  const beforeWindow = chatWindow.filter(
    (m) => m.timestamp >= sentAt - 15_000 && m.timestamp < sentAt
  );
  const afterRate = windowMessages.length / 45;
  const beforeRate = beforeWindow.length > 0 ? beforeWindow.length / 15 : 0;

  if (afterRate > beforeRate * 1.5 && windowMessages.length >= 4) {
    reactionScore += 20;
    reactionCount += Math.floor(windowMessages.length * 0.3);
  }

  reactionScore = Math.min(100, reactionScore);

  logger.debug(
    { message: message.slice(0, 40), reactionScore, reactionCount, windowSize: windowMessages.length },
    "Reaction evaluation done"
  );

  if (reactionScore >= 25 && onEvaluated) {
    await onEvaluated(pending, reactionScore, reactionCount);
  }
}

export function resetReactionTracker(): void {
  chatWindow.length = 0;
  pendingMessages.clear();
}

export function getPendingCount(): number {
  return pendingMessages.size;
}
