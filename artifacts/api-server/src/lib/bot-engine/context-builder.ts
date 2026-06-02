import { getGameState, getGameStateDescription, type CS2GameState } from "./game-state-machine";
import { getHypeState, type HypeState } from "./chat-hype-detector";
import { getSession, getSessionContextString, getMoodInstruction } from "./session-memory";
import { getNarrativeForPrompt } from "./stream-narrative";

export interface BotContext {
  recentSpeech: string[];
  recentVisionSummaries: string[];
  recentChatMessages: Array<{ user: string; message: string; timestamp: number }>;
  recentBotMessages: string[];
  streamTitle?: string;
  gameName?: string;
  gameState?: CS2GameState;
  hypeState?: HypeState;
}

const MAX_ENTRIES = 20;

const context: BotContext = {
  recentSpeech: [],
  recentVisionSummaries: [],
  recentChatMessages: [],
  recentBotMessages: [],
};

export function addSpeechTranscript(text: string): void {
  context.recentSpeech.push(text);
  if (context.recentSpeech.length > MAX_ENTRIES) context.recentSpeech.shift();
}

export function addVisionSummary(summary: string): void {
  context.recentVisionSummaries.push(summary);
  if (context.recentVisionSummaries.length > MAX_ENTRIES) context.recentVisionSummaries.shift();
}

export function addChatMessage(user: string, message: string): void {
  context.recentChatMessages.push({ user, message, timestamp: Date.now() });
  if (context.recentChatMessages.length > MAX_ENTRIES) context.recentChatMessages.shift();
}

export function addBotMessage(message: string): void {
  context.recentBotMessages.push(message);
  if (context.recentBotMessages.length > 10) context.recentBotMessages.shift();
}

export function setStreamMeta(title?: string, gameName?: string): void {
  context.streamTitle = title;
  context.gameName = gameName;
}

export function getContext(): BotContext {
  return {
    ...context,
    gameState: getGameState(),
    hypeState: getHypeState(),
  };
}

/**
 * Выбирает паттерны контекстно-зависимо, а не случайно.
 * Высокий хайп → короткие паттерны, клатч → реакшн-паттерны.
 */
export function selectContextualPatterns(
  patterns: string[],
  limit = 15
): { patterns: string[]; reason: string } {
  if (patterns.length === 0) return { patterns: [], reason: "no patterns" };

  const gs = getGameState();
  const hs = getHypeState();

  if (hs.isHot && hs.currentLevel >= 7) {
    const short = patterns.filter((p) => p.split(" ").length <= 4);
    if (short.length >= 5) {
      return { patterns: short.slice(0, limit), reason: `hype:${hs.currentLevel}` };
    }
  }

  if (gs.isClutch || gs.isBombPlanted || gs.momentType === "clutch") {
    const reaction = patterns.filter((p) =>
      /ору|боже|нееее|монка|omg|wow|!!|клатч|clutch/i.test(p)
    );
    if (reaction.length >= 3) {
      return { patterns: reaction.slice(0, limit), reason: "clutch_moment" };
    }
  }

  if (gs.momentType === "ace" || gs.momentType === "win") {
    const hype = patterns.filter((p) =>
      /красава|топ|имба|пог|pog|лол|збс|вп|ez|nice/i.test(p)
    );
    if (hype.length >= 3) {
      return { patterns: hype.slice(0, limit), reason: "ace_win" };
    }
  }

  if (gs.momentType === "death" || gs.momentType === "loss" || gs.consecutiveLosses >= 3) {
    const sad = patterns.filter((p) =>
      /f|пепега|кек|жиза|copium|sadge|ну и|блин/i.test(p)
    );
    if (sad.length >= 3) {
      return { patterns: sad.slice(0, limit), reason: "death_loss" };
    }
  }

  return { patterns: patterns.slice(0, limit), reason: "weighted_default" };
}

/**
 * Полный контекст-стринг для промпта — центральная функция.
 * Включает: stream narrative (60 мин дуга), game state, hype, session, паттерны.
 */
export function buildContextString(patterns: string[]): string {
  const parts: string[] = [];
  const gs = getGameState();
  const hs = getHypeState();

  if (context.streamTitle) parts.push(`🎮 Стрим: "${context.streamTitle}"`);
  if (context.gameName) parts.push(`Игра: ${context.gameName}`);

  // --- Stream narrative arc (60-min memory) ---
  const narrative = getNarrativeForPrompt();
  if (narrative) {
    parts.push(`\n📖 История стрима:\n${narrative}`);
  }

  // --- CS2 Game State ---
  const gsDesc = getGameStateDescription();
  if (gsDesc && gsDesc !== "Обычный момент") {
    parts.push(`\n📊 CS2 Состояние: ${gsDesc}`);
  }

  // --- Hype State ---
  if (hs.currentLevel >= 3) {
    const hypeLabel =
      hs.currentLevel >= 8 ? "🔥 ЧАТРУМ ВЗРЫВАЕТСЯ" :
      hs.currentLevel >= 6 ? "⚡ Чат разгорается" :
      "📈 Чат активизируется";
    parts.push(`${hypeLabel} (уровень ${hs.currentLevel}/10, ${hs.chatVelocity} msg/sec)`);
    if (hs.dominantTopic) parts.push(`  Тема: "${hs.dominantTopic}"`);
  }

  // --- Vision data ---
  if (context.recentVisionSummaries.length > 0) {
    parts.push(`\n👁 Экран (последние ${Math.min(3, context.recentVisionSummaries.length)} кадра):`);
    context.recentVisionSummaries.slice(-3).forEach((s) => parts.push(`  - ${s}`));
  }

  // --- Streamer speech ---
  if (context.recentSpeech.length > 0) {
    parts.push(`\n🎤 Стример сказал:`);
    context.recentSpeech.slice(-4).forEach((s) => parts.push(`  - "${s}"`));
  }

  // --- Recent chat ---
  if (context.recentChatMessages.length > 0) {
    parts.push(`\n💬 Чат (последние сообщения):`);
    context.recentChatMessages.slice(-12).forEach((m) =>
      parts.push(`  ${m.user}: ${m.message}`)
    );
  }

  // --- Bot's own messages (no repeat) ---
  if (context.recentBotMessages.length > 0) {
    parts.push(`\n🚫 Ты уже написал (НЕ повторять):`);
    context.recentBotMessages.slice(-6).forEach((m) => parts.push(`  - "${m}"`));
  }

  // --- Session context ---
  const sessionCtx = getSessionContextString();
  if (sessionCtx) {
    parts.push(`\n📝 Контекст сессии:\n${sessionCtx}`);
  }

  // --- Contextual patterns ---
  const { patterns: selectedPatterns, reason } = selectContextualPatterns(patterns);
  if (selectedPatterns.length > 0) {
    parts.push(`\n📚 Реальные фразы из чатов (стиль, не копировать) [${reason}]:`);
    selectedPatterns.forEach((p) => parts.push(`  - "${p}"`));
  }

  // --- Mood instruction ---
  const moodHint = getMoodInstruction();
  if (moodHint) {
    parts.push(`\n💡 Подсказка: ${moodHint}`);
  }

  return parts.join("\n");
}
