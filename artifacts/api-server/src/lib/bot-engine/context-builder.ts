export interface BotContext {
  recentSpeech: string[];
  recentVisionSummaries: string[];
  recentChatMessages: Array<{ user: string; message: string }>;
  recentBotMessages: string[];
  streamTitle?: string;
  gameName?: string;
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
  context.recentChatMessages.push({ user, message });
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
  return { ...context };
}

export function buildContextString(patterns: string[]): string {
  const parts: string[] = [];

  if (context.streamTitle) parts.push(`Stream: "${context.streamTitle}"`);
  if (context.gameName) parts.push(`Game: ${context.gameName}`);

  if (context.recentVisionSummaries.length > 0) {
    parts.push(`\nScreen (last ${context.recentVisionSummaries.length} observations):`);
    context.recentVisionSummaries.slice(-5).forEach((s) => parts.push(`  - ${s}`));
  }

  if (context.recentSpeech.length > 0) {
    parts.push(`\nStreamer said (recent):`);
    context.recentSpeech.slice(-5).forEach((s) => parts.push(`  - "${s}"`));
  }

  if (context.recentChatMessages.length > 0) {
    parts.push(`\nRecent chat:`);
    context.recentChatMessages.slice(-10).forEach((m) => parts.push(`  ${m.user}: ${m.message}`));
  }

  if (context.recentBotMessages.length > 0) {
    parts.push(`\nYour recent messages (do NOT repeat these):`);
    context.recentBotMessages.forEach((m) => parts.push(`  - "${m}"`));
  }

  if (patterns.length > 0) {
    parts.push(`\nExamples of how real viewers chat in this community (use as style reference, not copy-paste):`);
    patterns.slice(0, 15).forEach((p) => parts.push(`  - "${p}"`));
  }

  return parts.join("\n");
}
