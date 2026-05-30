export interface BotState {
  running: boolean;
  channel: string | null;
  startedAt: Date | null;
  messagesSent: number;
  lastAction: string | null;
}

const state: BotState = {
  running: false,
  channel: null,
  startedAt: null,
  messagesSent: 0,
  lastAction: null,
};

export function getBotState(): BotState {
  return { ...state };
}

export function setBotRunning(running: boolean, channel?: string | null): void {
  state.running = running;
  if (running) {
    state.startedAt = new Date();
    state.channel = channel ?? state.channel;
  } else {
    state.startedAt = null;
  }
}

export function incrementMessagesSent(): void {
  state.messagesSent++;
}

export function setLastAction(action: string): void {
  state.lastAction = action;
}

export function getUptimeSeconds(): number {
  if (!state.startedAt) return 0;
  return Math.floor((Date.now() - state.startedAt.getTime()) / 1000);
}
