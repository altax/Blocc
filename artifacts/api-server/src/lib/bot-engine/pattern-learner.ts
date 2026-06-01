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
  const totalAlpha = cyrillicCount + latinCount;
  if (totalAlpha === 0) return "en"; // цифры/эмоуты — считаем en
  const cyrillicRatio = cyrillicCount / totalAlpha;
  if (cyrillicRatio >= 0.7) return "ru";
  if (cyrillicRatio <= 0.3) return "en";
  return "mixed";
}

export function detectGame(text: string): string {
  const t = text.toLowerCase();
  // CS2/CSGO терминология — расширенный список
  if (/\b(cs2|csgo|counter.?strike)\b|флеш|флэш|смок|пуш|раш|ретейк|форс|eco|full.?buy|awp|deagle|ak.?47|m4a|rifle|pistol|нож(?:ичек)?|\bкт\b|\bкт-?\b|т-сайд|б-сайт|а-сайт|мидл|хед-?шот|хедшот|\bace\b|клатч|clutch|\b[345]к\b|inferno|mirage|dust|overpass|anubis|vertigo|nuke|ancient|cache|train|раш|бомба|плант|дефуз|тикай|расти|ротейт|холд|тактик|стратег|бай|форс.?бай|пистолетн|нагиб|экономь|сэкономь|феник|флагман/i.test(t)) {
    return "cs2";
  }
  return "other";
}

/**
 * Классификатор типа сообщения. Порядок приоритетов:
 * 1. cs2_callout    — тактические команды/ситуации в игре
 * 2. cs2_reaction   — эмоциональная реакция на игровой момент (ОРУ, ВАУ, КРАСАВЧИК)
 * 3. cs2_result     — результат раунда/матча (gg, ez, победа, проигрыш)
 * 4. russian_slang  — общий русский сленг чата
 * 5. hype           — энтузиазм/hype-фразы
 * 6. joke / question / emote_combo / reaction
 */
export function classifyPattern(text: string): string {
  const t = text.toLowerCase().trim();

  // ── 1. CS2 тактика/каллауты ─────────────────────────────────────────
  if (/пуш|флеш(?:ани|уй)?|флэш|смок(?:ани)?|кидай|кидаем|тикай|ретейк|расти|ротейт(?:ируй)?|холд(?:уй)?|форсим|форс.?бай?|full.?buy|хл|5к|4к|3к|\bace\b|клатч|clutch|раш(?:ануть)?|ресет|кемп|боксить|пикать|\bпик\b|\bкт\b|т-сайд|б-сайт|а-сайт|мидл|ушан|плант(?:уй)?|дефузь|бомбу|тактик|стратег|позиция|выход|эко|форсить/i.test(t)) {
    return "cs2_callout";
  }

  // ── 2. Реакция на игровой момент (крики/возгласы/эмоции) ────────────
  if (/ору(?:ёт|ём|т)?\b|орнул|орать|ааа+|вау+|во+у+|о+й+|бля+д?|пиздец|еба+ть|е+б+а+|нере+ально|нереал|ну.{0,5}всё|нет нет нет|да.{0,5}да.{0,5}да|КРАСАВ|красавчик|красава|красавец|топчик|легенд|нагиб(?:атор)?|хладн|монстр|зверь|бог|господи|невероятн|ебаный рот|уди.{0,10}тельно|monkaS|pogchamp|pog\b|PogChamp|Clap|ЛЕЕТЫ|ЛЕЕЕЕТЫ|letyyyy|KEKW/i.test(t)) {
    return "cs2_reaction";
  }

  // ── 3. Итог раунда/матча ─────────────────────────────────────────────
  if (/\bgg\b|\bez\b|gg.?wp|gg.?ez|победа|выиграл|проиграл|слили|слив|gg guys|gg chat|ez game|easy|нам.{0,8}конец|всё.{0,8}слил|карусель|разнесли|смяли|уничтожили|разгромили|ваншот|одним|одной|с хп|с хипи/i.test(t)) {
    return "cs2_result";
  }

  // ── 4. Русский сленг чата ────────────────────────────────────────────
  if (/кекв|кек(?:н|ов)?\b|лол\b|хаха|ахах|хех|хихи|хд\b|кринж|краш\b|вп\b|имба|клоун|боже.{0,5}мой|ну и|да ладно|топ\b|пг\b|пикча|фанфары|збс|зашквар|нормис|варп|ну.{0,5}всё|капец|капиталки|ахах|неа\b|оппа|олдовый|кринго|душно|душнота|мимо|мем|мемас|это.{0,5}норм|збс|жиза|жиз|зашло|незашло|лахта|стрёмно|ноу.{0,5}клатч|ноу.{0,5}флеш|смешно|смеш|ну сложн/i.test(t)) {
    return "russian_slang";
  }

  // ── 5. Хайп/эмоуты ──────────────────────────────────────────────────
  if (/\bpog\b|pogchamp|lets.?go|letsgo|\bclap\b|omegalul|peepo|widepeepo|\bgg\b|ez(?:pz)?\b|siuu+|пог\b|HYPERCLAP|LULW|OMEGALUL|KEKW|peepoArrive|peepoLeave|NODDERS|feelsGoodMan|feelsBadMan|monkaGIGA|monkaMEGA/i.test(t)) {
    return "hype";
  }

  // ── 6. Шутка/ирония ──────────────────────────────────────────────────
  if (/lul\b|lmao|lol\b|kekw|4head|haha|xd\b|LOL|LUL|KEKW|OMEGALUL|это лол|это хд|😂|🤣|💀/i.test(t)) {
    return "joke";
  }

  // ── 7. Вопрос ────────────────────────────────────────────────────────
  if (text.includes("?") || /почем|зачем|откуда|когда|почему|как так|что случил|что было|куда|где.{0,10}купил|что за|это что|а что/i.test(t)) {
    return "question";
  }

  // ── 8. Эмоут-комбо (короткое и капс) ────────────────────────────────
  if (text.split(/\s+/).length <= 3 && (/[A-Z]{3,}/.test(text) || /[А-ЯЁ]{3,}/.test(text))) {
    return "emote_combo";
  }

  // ── 9. Согласие/несогласие ───────────────────────────────────────────
  if (/точно|именно|конечно|факт|правда|согласен|\+1\b|да\b|нет\b|ладно|react|same|agreed|\bfr\b|ngl|imo|это так|100%|сотка/i.test(t)) {
    return "reaction";
  }

  return "game_specific";
}

/**
 * Фильтр: возвращает true если сообщение похоже на живого человека.
 * Отсеивает: команды ботов, URL-ы, повторяющиеся символы, системные сообщения.
 */
function isHumanLike(text: string): boolean {
  if (text.length < 2 || text.length > 150) return false;
  // Команды ботов
  if (/^[!?$@]/.test(text)) return false;
  // URL-ы
  if (/https?:\/\/|www\.|\.com|\.ru|\.gg\//.test(text)) return false;
  // Имена известных ботов
  if (/nightbot|streamelements|moobot|fossabot|sery_bot|wizebot|botrix|stay_hydrated/i.test(text)) return false;
  // Слово "bot" отдельно
  if (/\bbot\b/i.test(text)) return false;
  // Спам повторяющихся символов (более 5 подряд одинаковых)
  if (/(.)\1{5,}/.test(text)) return false;
  // Чисто эмодзи-спам (5+ эмодзи подряд)
  if (/(\p{Emoji}){5,}/u.test(text)) return false;
  // Подозрительно похоже на автоматическое сообщение
  if (/\bfollowed\b|\bsubscribed\b|\braided\b|\bhosted\b|\bgifted\b/i.test(text)) return false;
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
