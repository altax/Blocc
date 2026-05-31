import * as fs from "fs";
import * as path from "path";

const DATA_ROOT = path.resolve(process.cwd(), "data/streamers");

export interface RawSample {
  user: string;
  text: string;
  timestamp: string;
}

export interface PatternEntry {
  content: string;
  type: string;
  frequency: number;
  language: string;
  game: string;
}

export interface StreamerAnalysis {
  channel: string;
  analyzed_at: string;
  stats: {
    total_messages: number;
    unique_phrases: number;
    ru_ratio: number;
    en_ratio: number;
    mixed_ratio: number;
    cs2_ratio: number;
    avg_message_length: number;
    top_pattern_types: Array<{ type: string; count: number; percent: number }>;
  };
  top_phrases: PatternEntry[];
  sample_messages: string[];
  style_notes: string[];
}

export interface StreamerFile {
  channel: string;
  has_raw: boolean;
  has_patterns: boolean;
  has_analysis: boolean;
  collected_at: string | null;
  total_messages: number;
  pattern_count: number;
}

function channelDir(channel: string): string {
  return path.join(DATA_ROOT, channel.toLowerCase());
}

function ensureDir(channel: string): void {
  const dir = channelDir(channel);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

export function saveRawSamples(channel: string, messages: RawSample[]): void {
  ensureDir(channel);
  const file = path.join(channelDir(channel), "raw_samples.json");
  const data = {
    channel,
    collected_at: new Date().toISOString(),
    total_raw: messages.length,
    messages,
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export function savePatternFile(channel: string, patterns: PatternEntry[]): void {
  ensureDir(channel);
  const file = path.join(channelDir(channel), "patterns.json");
  const data = {
    channel,
    collected_at: new Date().toISOString(),
    total_patterns: patterns.length,
    patterns,
  };
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

export function analyzeAndSave(
  channel: string,
  messages: RawSample[],
  patterns: PatternEntry[]
): StreamerAnalysis {
  const total = messages.length || 1;

  const langCounts = { ru: 0, en: 0, mixed: 0 };
  let cs2Count = 0;
  let totalLen = 0;
  const typeCounts = new Map<string, number>();

  for (const p of patterns) {
    langCounts[p.language as keyof typeof langCounts] =
      (langCounts[p.language as keyof typeof langCounts] || 0) + p.frequency;
    if (p.game === "cs2") cs2Count += p.frequency;
    typeCounts.set(p.type, (typeCounts.get(p.type) || 0) + p.frequency);
  }

  for (const m of messages) totalLen += m.text.length;

  const totalFreq = patterns.reduce((s, p) => s + p.frequency, 0) || 1;

  const topTypes = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([type, count]) => ({
      type,
      count,
      percent: Math.round((count / totalFreq) * 100),
    }));

  // Style notes — human-readable insights
  const notes: string[] = [];
  const ruRatio = langCounts.ru / (totalFreq || 1);
  const cs2Ratio = cs2Count / (totalFreq || 1);

  if (ruRatio > 0.6) notes.push("Чат преимущественно на русском языке");
  if (ruRatio < 0.3) notes.push("Чат преимущественно на английском");
  if (cs2Ratio > 0.4) notes.push("Много CS2-специфичных фраз (каллауты, тактика)");
  if (cs2Ratio < 0.1) notes.push("Чат не очень CS2-специфичен, больше эмоций/мемов");
  if (topTypes[0]?.type === "russian_slang") notes.push("Доминирует русский сленг — мемный чат");
  if (topTypes[0]?.type === "hype") notes.push("Очень хайповый чат, много эмоций");
  if (topTypes[0]?.type === "cs2_callout") notes.push("Чат активно комментирует игру");
  if (totalLen / total > 40) notes.push("Длинные сообщения — развёрнутые комментарии");
  if (totalLen / total < 15) notes.push("Короткие сообщения — быстрые реакции, эмоуты");

  const analysis: StreamerAnalysis = {
    channel,
    analyzed_at: new Date().toISOString(),
    stats: {
      total_messages: messages.length,
      unique_phrases: patterns.length,
      ru_ratio: Math.round(ruRatio * 100),
      en_ratio: Math.round((langCounts.en / totalFreq) * 100),
      mixed_ratio: Math.round((langCounts.mixed / totalFreq) * 100),
      cs2_ratio: Math.round(cs2Ratio * 100),
      avg_message_length: Math.round(totalLen / total),
      top_pattern_types: topTypes,
    },
    top_phrases: patterns.slice(0, 30),
    sample_messages: messages.slice(0, 50).map((m) => m.text),
    style_notes: notes,
  };

  ensureDir(channel);
  const file = path.join(channelDir(channel), "analysis.json");
  fs.writeFileSync(file, JSON.stringify(analysis, null, 2), "utf8");

  return analysis;
}

export function loadAnalysis(channel: string): StreamerAnalysis | null {
  const file = path.join(channelDir(channel), "analysis.json");
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as StreamerAnalysis;
  } catch {
    return null;
  }
}

export function loadPatterns(channel: string): PatternEntry[] | null {
  const file = path.join(channelDir(channel), "patterns.json");
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.patterns as PatternEntry[];
  } catch {
    return null;
  }
}

export function loadRawSamples(channel: string): RawSample[] | null {
  const file = path.join(channelDir(channel), "raw_samples.json");
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return data.messages as RawSample[];
  } catch {
    return null;
  }
}

export function listStreamers(): StreamerFile[] {
  if (!fs.existsSync(DATA_ROOT)) return [];

  const dirs = fs.readdirSync(DATA_ROOT).filter((d) => {
    return fs.statSync(path.join(DATA_ROOT, d)).isDirectory();
  });

  return dirs.map((channel) => {
    const dir = channelDir(channel);
    const hasRaw = fs.existsSync(path.join(dir, "raw_samples.json"));
    const hasPatterns = fs.existsSync(path.join(dir, "patterns.json"));
    const hasAnalysis = fs.existsSync(path.join(dir, "analysis.json"));

    let collectedAt: string | null = null;
    let totalMessages = 0;
    let patternCount = 0;

    if (hasRaw) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(dir, "raw_samples.json"), "utf8"));
        collectedAt = raw.collected_at;
        totalMessages = raw.total_raw;
      } catch { /* ignore */ }
    }
    if (hasPatterns) {
      try {
        const p = JSON.parse(fs.readFileSync(path.join(dir, "patterns.json"), "utf8"));
        patternCount = p.total_patterns;
      } catch { /* ignore */ }
    }

    return { channel, has_raw: hasRaw, has_patterns: hasPatterns, has_analysis: hasAnalysis, collected_at: collectedAt, total_messages: totalMessages, pattern_count: patternCount };
  });
}
