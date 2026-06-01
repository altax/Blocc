import * as net from "net";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import { logger } from "../logger";
import { getPresetChannels } from "../cs2-ru-streamers";
import {
  saveRawSamples,
  savePatternFile,
  analyzeAndSave,
  type RawSample,
  type PatternEntry,
} from "../streamer-analyzer";
import { emitLearningEvent, recordStats } from "../learning-events";

interface RawMessage {
  user: string;
  text: string;
}

export function detectLanguage(text: string): "ru" | "en" | "mixed" {
  const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (cyrillicCount > 0 && latinCount > 0) return "mixed";
  if (cyrillicCount > 0) return "ru";
  return "en";
}

export function detectGame(text: string): string {
  const t = text.toLowerCase();
  if (/cs2|csgo|counter.?strike|флеш|флэш|смок|пуш|раш|ретейк|awp|ak-?47|rifle|pistol|ct|terrorist|inferno|mirage|dust|overpass|anubis|vertigo|5к|4к|3к|ace|клатч|clutch|eco|форс/i.test(t)) {
    return "cs2";
  }
  return "other";
}

export function classifyPattern(text: string): string {
  const t = text.toLowerCase();
  if (/пуш|флеш|флэш|смок|кидай|кидаем|тикай|ретейк|расти|ротейт|холд|форсим|форс|eco|full.?buy|хл|5к|4к|3к|ace|клатч|clutch|раш|ресет|кемп|боксить|пикать|пик|кт|т-сайд|б-сайт|а-сайт/i.test(t)) {
    return "cs2_callout";
  }
  if (/кекв|кек(?!\w)|лол(?!\w)|хаха|ахах|ору|орнул|орём|хд(?!\w)|кринж|краш(?!\w)|красавчик|красава|вп(?!\w)|нагиб|имба|клоун|боже|ну и|да ладно|топчик|топ(?!\w)|пг(?!\w)|пикча|фанфары|збс|зашквар|нормис|варп/i.test(t)) {
    return "russian_slang";
  }
  if (/pog|pogchamp|letsgo|lets.?go|clap|omegalul|peepo|widepeepo|chatting|siuuu|gg(?!\w)|ez(?!\w)|пог/i.test(t)) {
    return "hype";
  }
  if (/lul(?!\w)|lmao|lol(?!\w)|kekw|4head|omegalul|haha|xd(?!\w)/i.test(t)) {
    return "joke";
  }
  if (text.includes("?")) return "question";
  if (text.split(" ").length <= 3 && (/[A-Z]{3,}/.test(text) || /[А-ЯЁ]{2,}/.test(text))) {
    return "emote_combo";
  }
  if (/точно|именно|конечно|факт|правда|согласен|да(?!\w)|нет(?!\w)|ладно|react|same|agreed|fr(?!\w)|ngl|imo/i.test(t)) {
    return "reaction";
  }
  return "game_specific";
}

function isHumanLike(text: string): boolean {
  if (text.length < 2 || text.length > 150) return false;
  if (/^!/.test(text)) return false;
  if (/https?:\/\//.test(text)) return false;
  if (/\bbot\b/i.test(text)) return false;
  if (/nightbot|streamelements|moobot|fossabot/i.test(text)) return false;
  return true;
}

function collectViaIRC(channel: string, messageCount: number): Promise<RawMessage[]> {
  return new Promise((resolve, reject) => {
    const messages: RawMessage[] = [];
    let buffer = "";
    let resolved = false;

    const socket = new net.Socket();

    const done = () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      resolve(messages);
    };

    socket.connect(6667, "irc.chat.twitch.tv", () => {
      socket.write("PASS SCHMOOPIIE\r\n");
      socket.write(`NICK justinfan${Math.floor(Math.random() * 99999)}\r\n`);
      socket.write(`JOIN #${channel.toLowerCase()}\r\n`);
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.startsWith("PING")) socket.write(`PONG${line.slice(4)}\r\n`);
        const match = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
        if (match) {
          const [, user, text] = match;
          if (isHumanLike(text)) messages.push({ user, text });
          if (messages.length >= messageCount) done();
        }
      }
    });

    socket.on("error", (err) => {
      logger.error({ err, channel }, "IRC error during collection");
      if (!resolved) { resolved = true; reject(err); }
    });

    setTimeout(() => { if (!resolved) done(); }, 300_000);
  });
}

export async function collectPatternsFromChannel(
  channel: string,
  messageCount = 500
): Promise<number> {
  const messages = await collectViaIRC(channel, messageCount);
  return savePatterns(channel, messages);
}

export async function bulkLearnFromStreamers(
  channels: string[],
  messageCountPerChannel = 300
): Promise<void> {
  logger.info({ channels, messageCountPerChannel }, "Starting bulk pattern learning");
  for (const channel of channels) {
    try {
      const count = await collectPatternsFromChannel(channel, messageCountPerChannel);
      logger.info({ channel, count }, "Bulk learn: channel done");
      await new Promise((r) => setTimeout(r, 2000));
    } catch (err) {
      logger.error({ err, channel }, "Bulk learn: channel failed, continuing");
    }
  }
  logger.info({ channels }, "Bulk pattern learning complete");
}

export function getPresetCS2Channels(): string[] {
  return getPresetChannels(3);
}

async function savePatterns(channel: string, messages: RawMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  const patternMap = new Map<string, { count: number; type: string; lang: string; game: string }>();

  for (const msg of messages) {
    const key = msg.text.trim().toLowerCase();
    const existing = patternMap.get(key);
    if (existing) {
      existing.count++;
    } else {
      patternMap.set(msg.text.trim(), {
        count: 1,
        type: classifyPattern(msg.text),
        lang: detectLanguage(msg.text),
        game: detectGame(msg.text),
      });
    }
  }

  const sorted = Array.from(patternMap.entries()).sort((a, b) => {
    const score = (e: typeof a) =>
      (e[1].lang === "ru" ? 3 : e[1].lang === "mixed" ? 1 : 0) +
      (e[1].game === "cs2" ? 2 : 0) + e[1].count;
    return score(b) - score(a);
  });

  const toSave = sorted.slice(0, 250);

  // 1. Сохраняем в PostgreSQL
  for (const [content, { count, type, lang, game }] of toSave) {
    await db
      .insert(chatPatternsTable)
      .values({ sourceChannel: channel, patternType: type, content, frequency: count, language: lang, game })
      .onConflictDoNothing();
  }

  // 2. Сохраняем raw семплы в файл
  const rawSamples: RawSample[] = messages.map((m) => ({
    user: m.user,
    text: m.text,
    timestamp: new Date().toISOString(),
  }));
  saveRawSamples(channel, rawSamples);

  // 3. Сохраняем паттерны в файл
  const patternEntries: PatternEntry[] = toSave.map(([content, { count, type, lang, game }]) => ({
    content,
    type,
    frequency: count,
    language: lang,
    game,
  }));
  savePatternFile(channel, patternEntries);

  // 4. Генерируем и сохраняем анализ
  analyzeAndSave(channel, rawSamples, patternEntries);

  logger.info({ channel, saved: toSave.length }, "Saved chat patterns + files");
  return toSave.length;
}

// ─── Incremental (real-time) learning ──────────────────────────────────────

/**
 * In-memory аккумулятор: channel → content → {count, type, lang, game}
 * Накапливает паттерны между flush-ами.
 */
const accumulator = new Map<
  string,
  Map<string, { count: number; type: string; lang: string; game: string }>
>();

/**
 * Обрабатывает одно сообщение из IRC в режиме реального времени.
 * Вызывается session-recorder'ом на каждое входящее сообщение.
 * Эмитит события обучения — видны в /api/learning/feed.
 */
export function processMessageForLearning(
  channel: string,
  user: string,
  text: string
): void {
  const passed = isHumanLike(text);

  const patternType = classifyPattern(text);
  const lang = detectLanguage(text);
  const game = detectGame(text);

  // Событие: сообщение классифицировано (показываем все, даже отфильтрованные)
  emitLearningEvent({
    type: "msg_classified",
    channel,
    msg: { user, text },
    classification: { pattern_type: patternType, lang, game },
  });

  if (!passed) return; // ботокоманды, ссылки — не учим

  recordStats(channel, "processed");

  if (!accumulator.has(channel)) accumulator.set(channel, new Map());
  const acc = accumulator.get(channel)!;
  const key = text.trim();
  const existing = acc.get(key);

  if (existing) {
    existing.count++;
    // Событие: частота паттерна выросла
    emitLearningEvent({
      type: "pattern_updated",
      channel,
      pattern: { content: text, pattern_type: patternType, frequency: existing.count, is_new: false },
    });
    recordStats(channel, "updated");
  } else {
    acc.set(key, { count: 1, type: patternType, lang, game });
    // Событие: обнаружен новый паттерн
    emitLearningEvent({
      type: "pattern_new",
      channel,
      pattern: { content: text, pattern_type: patternType, frequency: 1, is_new: true },
    });
    recordStats(channel, "new");
  }
}

/**
 * Записывает накопленные паттерны в PostgreSQL.
 * Вызывается каждые 100 сообщений и при завершении сессии.
 */
export async function flushAccumulatorToDB(channel: string): Promise<number> {
  const acc = accumulator.get(channel);
  if (!acc || acc.size === 0) return 0;

  // Сортируем по приоритету (ru + cs2 + частота)
  const sorted = Array.from(acc.entries())
    .sort((a, b) => {
      const score = (e: (typeof a)) =>
        (e[1].lang === "ru" ? 3 : e[1].lang === "mixed" ? 1 : 0) +
        (e[1].game === "cs2" ? 2 : 0) +
        e[1].count;
      return score(b) - score(a);
    })
    .slice(0, 250);

  let saved = 0;
  for (const [content, { count, type, lang, game }] of sorted) {
    try {
      await db
        .insert(chatPatternsTable)
        .values({ sourceChannel: channel, patternType: type, content, frequency: count, language: lang, game })
        .onConflictDoNothing();
      saved++;
    } catch { /* ignore individual errors */ }
  }

  acc.clear();
  recordStats(channel, "flush");
  emitLearningEvent({
    type: "batch_flushed",
    channel,
    batch_stats: { processed: sorted.length, saved },
  });

  logger.info({ channel, saved }, "Incremental learning: flushed accumulator to DB");
  return saved;
}

/**
 * Возвращает состояние аккумулятора для отображения в дашборде.
 */
export function getAccumulatorPreview(): Array<{
  channel: string;
  pending: number;
  top5: Array<{ content: string; count: number; type: string }>;
}> {
  return Array.from(accumulator.entries()).map(([channel, acc]) => {
    const sorted = Array.from(acc.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([content, v]) => ({ content, count: v.count, type: v.type }));
    return { channel, pending: acc.size, top5: sorted };
  });
}
