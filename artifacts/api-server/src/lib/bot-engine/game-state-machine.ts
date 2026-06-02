/**
 * CS2 Game State Machine — извлекает структурированное состояние игры
 * из текстовых описаний vision-analyzer и речи стримера.
 * Отслеживает: фазу раунда, счёт, тип момента, интенсивность, настроение сессии.
 */

export type RoundPhase =
  | "warmup"
  | "buy"
  | "fight"
  | "planted"
  | "end"
  | "halftime"
  | "overtime"
  | "unknown";

export type MomentType =
  | "ace"
  | "clutch"
  | "bomb_planted"
  | "bomb_defused"
  | "knife_kill"
  | "headshot_streak"
  | "death"
  | "eco_win"
  | "pistol_round"
  | "awp_highlight"
  | "win"
  | "loss"
  | "normal";

export type SessionMood =
  | "hyped"   // идёт хорошо, атмосфера позитивная
  | "tense"   // тайт матч, напряжение
  | "tilted"  // стример фрустрирован, проигрывает
  | "chill"   // спокойно, ничего особенного
  | "comeback"// отыгрываются после разгрома
  | "stomp";  // легко выигрывают

export interface CS2GameState {
  roundPhase: RoundPhase;
  momentType: MomentType;
  momentIntensity: number; // 0-10, выше = горячее
  sessionMood: SessionMood;
  ctScore: number;
  tScore: number;
  consecutiveLosses: number;
  consecutiveWins: number;
  map?: string;
  isBombPlanted: boolean;
  isClutch: boolean;
  lastEventDescription: string;
  updatedAt: number;
}

const DEFAULT_STATE: CS2GameState = {
  roundPhase: "unknown",
  momentType: "normal",
  momentIntensity: 0,
  sessionMood: "chill",
  ctScore: 0,
  tScore: 0,
  consecutiveLosses: 0,
  consecutiveWins: 0,
  isBombPlanted: false,
  isClutch: false,
  lastEventDescription: "",
  updatedAt: 0,
};

let state: CS2GameState = { ...DEFAULT_STATE };

// --- Pattern banks для извлечения из текста ---

const ACE_PATTERNS = /\b(ace|эйс|5к|5 kills?|aces?)\b/i;
const CLUTCH_PATTERNS = /\b(clutch|клатч|1v\d|1 vs \d|carry)\b/i;
const BOMB_PATTERNS = /\b(bomb planted|бомба заложена|planted|plant|заложил)\b/i;
const DEFUSE_PATTERNS = /\b(defused?|разминировал|обезвредил|дефуз)\b/i;
const KNIFE_PATTERNS = /\b(knife|ножик|ножом|нож)\b/i;
const AWP_PATTERNS = /\b(awp|awper|снайпер|снайп)\b/i;
const DEATH_PATTERNS = /\b(умер|died?|killed|убили|смерть|dead)\b/i;
const WIN_PATTERNS = /\b(win|выиграл|победа|выиграли|won|round win)\b/i;
const LOSS_PATTERNS = /\b(loss|проиграл|проигрыш|lose|lost|поражение)\b/i;
const BUY_PATTERNS = /\b(buy|покупка|buying|buy phase|закупка)\b/i;
const PISTOL_PATTERNS = /\b(pistol|пистоль|пистолет|pistol round)\b/i;
const ECO_PATTERNS = /\b(eco|эко|save|сейв|deagle|deagle round)\b/i;
const HALFTIME_PATTERNS = /\b(halftime|half time|смена сторон|half|хавтайм)\b/i;
const WARMUP_PATTERNS = /\b(warmup|разминка|warm.?up)\b/i;
const OVERTIME_PATTERNS = /\b(overtime|овертайм|OT|ovr)\b/i;
const HS_PATTERNS = /\b(headshot|хедшот|в голову|hs)\b/i;

const MAPS: Record<string, string> = {
  mirage: "de_mirage", inferno: "de_inferno", nuke: "de_nuke",
  ancient: "de_ancient", anubis: "de_anubis", vertigo: "de_vertigo",
  dust2: "de_dust2", dust: "de_dust2", overpass: "de_overpass",
  cache: "de_cache", train: "de_train", cobble: "de_cobblestone",
};

const SCORE_REGEX = /(\d{1,2})\s*[-:]\s*(\d{1,2})/;

// История раундов для мудного расчёта
const roundHistory: Array<"win" | "loss"> = [];

function detectMomentType(text: string): { type: MomentType; intensity: number } {
  const t = text.toLowerCase();

  if (ACE_PATTERNS.test(t)) return { type: "ace", intensity: 10 };
  if (CLUTCH_PATTERNS.test(t)) return { type: "clutch", intensity: 9 };
  if (DEFUSE_PATTERNS.test(t)) return { type: "bomb_defused", intensity: 8 };
  if (BOMB_PATTERNS.test(t)) return { type: "bomb_planted", intensity: 7 };
  if (KNIFE_PATTERNS.test(t)) return { type: "knife_kill", intensity: 8 };
  if (AWP_PATTERNS.test(t) && (WIN_PATTERNS.test(t) || HS_PATTERNS.test(t))) {
    return { type: "awp_highlight", intensity: 7 };
  }
  if (ECO_PATTERNS.test(t) && WIN_PATTERNS.test(t)) return { type: "eco_win", intensity: 7 };
  if (PISTOL_PATTERNS.test(t)) return { type: "pistol_round", intensity: 5 };
  if (WIN_PATTERNS.test(t)) return { type: "win", intensity: 5 };
  if (LOSS_PATTERNS.test(t)) return { type: "loss", intensity: 4 };
  if (DEATH_PATTERNS.test(t)) return { type: "death", intensity: 3 };
  if (HS_PATTERNS.test(t)) return { type: "headshot_streak", intensity: 6 };

  return { type: "normal", intensity: 1 };
}

function detectRoundPhase(text: string): RoundPhase {
  const t = text.toLowerCase();
  if (WARMUP_PATTERNS.test(t)) return "warmup";
  if (HALFTIME_PATTERNS.test(t)) return "halftime";
  if (OVERTIME_PATTERNS.test(t)) return "overtime";
  if (BOMB_PATTERNS.test(t)) return "planted";
  if (BUY_PATTERNS.test(t)) return "buy";
  if (WIN_PATTERNS.test(t) || LOSS_PATTERNS.test(t)) return "end";
  if (DEATH_PATTERNS.test(t) || ACE_PATTERNS.test(t) || CLUTCH_PATTERNS.test(t)) return "fight";
  return "unknown";
}

function detectMap(text: string): string | undefined {
  const t = text.toLowerCase();
  for (const [key, val] of Object.entries(MAPS)) {
    if (t.includes(key)) return val;
  }
  return undefined;
}

function calcSessionMood(): SessionMood {
  if (roundHistory.length < 2) return "chill";

  const recent5 = roundHistory.slice(-5);
  const wins = recent5.filter((r) => r === "win").length;
  const losses = recent5.filter((r) => r === "loss").length;

  const consecutiveLoss = state.consecutiveLosses;
  const consecutiveWin = state.consecutiveWins;

  if (consecutiveLoss >= 5) return "tilted";
  if (consecutiveLoss >= 3 && consecutiveWin >= 2) return "comeback";
  if (consecutiveWin >= 4) return "stomp";
  if (consecutiveWin >= 2) return "hyped";

  const ct = state.ctScore;
  const t = state.tScore;
  const diff = Math.abs(ct - t);
  if (diff <= 2 && (ct + t) > 10) return "tense";

  if (losses > wins) return "chill";
  return "chill";
}

/**
 * Обновляет game state на основе нового текстового описания
 * (из vision-analyzer или speech)
 */
export function updateGameState(description: string): CS2GameState {
  const now = Date.now();
  const { type: momentType, intensity: momentIntensity } = detectMomentType(description);
  const roundPhase = detectRoundPhase(description);
  const map = detectMap(description) ?? state.map;

  // Попытка извлечь счёт из текста
  const scoreMatch = SCORE_REGEX.exec(description);
  let ctScore = state.ctScore;
  let tScore = state.tScore;
  if (scoreMatch) {
    const a = parseInt(scoreMatch[1]!, 10);
    const b = parseInt(scoreMatch[2]!, 10);
    if (a + b <= 30 && Math.max(a, b) <= 16) {
      ctScore = a;
      tScore = b;
    }
  }

  // Обновляем историю побед/поражений
  let consecutiveLosses = state.consecutiveLosses;
  let consecutiveWins = state.consecutiveWins;

  if (momentType === "win") {
    roundHistory.push("win");
    consecutiveWins = (state.consecutiveWins || 0) + 1;
    consecutiveLosses = 0;
  } else if (momentType === "loss") {
    roundHistory.push("loss");
    consecutiveLosses = (state.consecutiveLosses || 0) + 1;
    consecutiveWins = 0;
  }
  if (roundHistory.length > 30) roundHistory.shift();

  const isBombPlanted = BOMB_PATTERNS.test(description) && !DEFUSE_PATTERNS.test(description);
  const isClutch = CLUTCH_PATTERNS.test(description);

  state = {
    roundPhase,
    momentType,
    momentIntensity: Math.max(state.momentIntensity * 0.5, momentIntensity), // decay previous
    sessionMood: calcSessionMood(),
    ctScore,
    tScore,
    consecutiveLosses,
    consecutiveWins,
    map,
    isBombPlanted,
    isClutch,
    lastEventDescription: description.slice(0, 200),
    updatedAt: now,
  };

  return { ...state };
}

export function getGameState(): CS2GameState {
  // Интенсивность постепенно затухает
  const elapsed = (Date.now() - state.updatedAt) / 1000;
  const decayedIntensity = Math.max(0, state.momentIntensity - elapsed * 0.3);
  return { ...state, momentIntensity: Math.round(decayedIntensity * 10) / 10 };
}

export function resetGameState(): void {
  state = { ...DEFAULT_STATE };
  roundHistory.length = 0;
}

/**
 * Описание состояния для инъекции в промпт
 */
export function getGameStateDescription(): string {
  const gs = getGameState();
  const parts: string[] = [];

  if (gs.map) parts.push(`Карта: ${gs.map}`);
  if (gs.ctScore > 0 || gs.tScore > 0) parts.push(`Счёт: CT ${gs.ctScore} - T ${gs.tScore}`);
  if (gs.roundPhase !== "unknown") parts.push(`Фаза: ${gs.roundPhase}`);
  if (gs.momentType !== "normal") parts.push(`Момент: ${gs.momentType} (интенсивность ${gs.momentIntensity}/10)`);
  if (gs.isBombPlanted) parts.push("🔴 БОМБА ЗАЛОЖЕНА");
  if (gs.isClutch) parts.push("🔥 КЛАТЧ СИТУАЦИЯ");
  if (gs.consecutiveLosses >= 3) parts.push(`${gs.consecutiveLosses} поражений подряд`);
  if (gs.consecutiveWins >= 3) parts.push(`${gs.consecutiveWins} побед подряд`);
  if (gs.sessionMood !== "chill") parts.push(`Атмосфера: ${gs.sessionMood}`);

  return parts.length > 0 ? parts.join(" | ") : "Обычный момент";
}
