import * as net from "net";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import { logger } from "../logger";
import { getPresetChannels } from "../cs2-ru-streamers";

interface RawMessage {
  user: string;
  text: string;
}

function detectLanguage(text: string): "ru" | "en" | "mixed" {
  const cyrillicCount = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) || []).length;
  if (cyrillicCount > 0 && latinCount > 0) return "mixed";
  if (cyrillicCount > 0) return "ru";
  return "en";
}

function detectGame(text: string): string {
  const t = text.toLowerCase();
  if (/cs2|csgo|counter.?strike|флеш|флэш|смок|пуш|раш|ретейк|awp|ak-?47|rifle|pistol|ct|terrorist|нuke|inferno|mirage|dust|overpass|anubis|vertigo|5к|4к|3к|ace|клатч|clutch|eco|форс/i.test(t)) {
    return "cs2";
  }
  return "other";
}

function classifyPattern(text: string): string {
  const t = text.toLowerCase();

  // CS2-специфичные каллауты и игровые фразы
  if (/пуш|флеш|флэш|смок|кидай|кидаем|тикай|ретейк|расти|ротейт|холд|форсим|форс|eco|full.?buy|хл|5к|4к|3к|ace|клатч|clutch|раш|ресет|кемп|боксить|пикать|пик|кт|т-сайд|б-сайт|а-сайт/i.test(t)) {
    return "cs2_callout";
  }

  // Русский сленг и мемы чата
  if (/кекв|кек(?!\w)|лол(?!\w)|хаха|ахах|ору|орнул|орём|хд(?!\w)|кринж|краш(?!\w)|красавчик|красава|вп(?!\w)|нагиб|имба|клоун|боже|ну и|да ладно|топчик|топ(?!\w)|пг(?!\w)|пикча|фанфары|збс|зашквар|нормис|варп/i.test(t)) {
    return "russian_slang";
  }

  // Hype / восторг
  if (/pog|pogchamp|letsgo|lets.?go|clap|omegalul|hypе|peepo|widepeepo|chatting|siuuu|gg(?!\w)|ez(?!\w)|пог|погgeRS/i.test(t)) {
    return "hype";
  }

  // Английский юмор
  if (/lul(?!\w)|lmao|lol(?!\w)|kekw|4head|omegalul|haha|xd(?!\w)/i.test(t)) {
    return "joke";
  }

  // Вопросы
  if (text.includes("?")) return "question";

  // Короткие эмоут-комбо (≤3 слова, есть капс или кириллица)
  if (text.split(" ").length <= 3 && (/[A-Z]{3,}/.test(text) || /[А-ЯЁ]{2,}/.test(text))) {
    return "emote_combo";
  }

  // Реакции-согласия
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

export async function collectPatternsFromChannel(
  channel: string,
  messageCount = 500
): Promise<number> {
  return new Promise((resolve, reject) => {
    const messages: RawMessage[] = [];
    let buffer = "";
    let resolved = false;

    const socket = new net.Socket();

    const done = () => {
      if (resolved) return;
      resolved = true;
      socket.destroy();
      savePatterns(channel, messages).then(resolve).catch(reject);
    };

    socket.connect(6667, "irc.chat.twitch.tv", () => {
      socket.write("PASS SCHMOOPIIE\r\n");
      socket.write("NICK justinfan" + Math.floor(Math.random() * 99999) + "\r\n");
      socket.write(`JOIN #${channel.toLowerCase()}\r\n`);
    });

    socket.on("data", (data) => {
      buffer += data.toString();
      const lines = buffer.split("\r\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (line.startsWith("PING")) {
          socket.write(`PONG${line.slice(4)}\r\n`);
        }

        const match = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
        if (match) {
          const [, , text] = match;
          if (isHumanLike(text)) {
            messages.push({ user: match[1], text });
          }
          if (messages.length >= messageCount) done();
        }
      }
    });

    socket.on("error", (err) => {
      logger.error({ err, channel }, "Pattern collection IRC error");
      if (!resolved) { resolved = true; reject(err); }
    });

    setTimeout(() => { if (!resolved) done(); }, 300_000);
  });
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

  // Сортируем — приоритет: русский язык, cs2, высокая частота
  const sorted = Array.from(patternMap.entries()).sort((a, b) => {
    const score = (e: typeof a) =>
      (e[1].lang === "ru" ? 3 : e[1].lang === "mixed" ? 1 : 0) +
      (e[1].game === "cs2" ? 2 : 0) +
      e[1].count;
    return score(b) - score(a);
  });

  const toSave = sorted.slice(0, 250);

  for (const [content, { count, type, lang, game }] of toSave) {
    await db
      .insert(chatPatternsTable)
      .values({ sourceChannel: channel, patternType: type, content, frequency: count, language: lang, game })
      .onConflictDoNothing();
  }

  logger.info({ channel, saved: toSave.length }, "Saved chat patterns");
  return toSave.length;
}
