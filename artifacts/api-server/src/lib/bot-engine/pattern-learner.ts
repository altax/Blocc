import * as net from "net";
import { db } from "@workspace/db";
import { chatPatternsTable } from "@workspace/db";
import { logger } from "../logger";

interface RawMessage {
  user: string;
  text: string;
}

function classifyPattern(text: string): string {
  const t = text.toLowerCase();
  if (/lul|lmao|lol|kekw|omegalul|haha|xd|4head/i.test(t)) return "joke";
  if (/pog|pogchamp|letsgoo|lets go|gg|ez|clap|peepo|hype|sick|fire|insane/i.test(t)) return "hype";
  if (text.includes("?")) return "question";
  if (/peepo|emote|combo|[A-Z]{3,}/.test(text) && text.split(" ").length <= 3) return "emote_combo";
  if (/react|true|yes|no|same|agreed|fr|ngl|imo/i.test(t)) return "reaction";
  return "game_specific";
}

function isHumanLike(text: string): boolean {
  if (text.length < 2 || text.length > 150) return false;
  if (/^!/.test(text)) return false; // bot commands
  if (/https?:\/\//.test(text)) return false; // links
  if (/\bbot\b/.test(text.toLowerCase())) return false;
  return true;
}

export async function collectPatternsFromChannel(
  channel: string,
  messageCount: number = 500
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
      socket.write("NICK justinfan12345\r\n");
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
          const [, user, text] = match;
          if (isHumanLike(text)) {
            messages.push({ user, text });
          }
          if (messages.length >= messageCount) {
            done();
          }
        }
      }
    });

    socket.on("error", (err) => {
      logger.error({ err, channel }, "Pattern collection IRC error");
      if (!resolved) {
        resolved = true;
        reject(err);
      }
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      if (!resolved) done();
    }, 300_000);
  });
}

async function savePatterns(channel: string, messages: RawMessage[]): Promise<number> {
  if (messages.length === 0) return 0;

  // Group similar messages and count frequency
  const patternMap = new Map<string, { count: number; type: string }>();

  for (const msg of messages) {
    const normalized = msg.text.trim().toLowerCase();
    const existing = patternMap.get(normalized);
    if (existing) {
      existing.count++;
    } else {
      patternMap.set(msg.text.trim(), {
        count: 1,
        type: classifyPattern(msg.text),
      });
    }
  }

  // Keep patterns that appeared at least twice or are unique enough
  const toSave = Array.from(patternMap.entries())
    .filter(([, v]) => v.count >= 1)
    .slice(0, 200);

  for (const [content, { count, type }] of toSave) {
    await db
      .insert(chatPatternsTable)
      .values({
        sourceChannel: channel,
        patternType: type,
        content,
        frequency: count,
      })
      .onConflictDoNothing();
  }

  logger.info({ channel, saved: toSave.length }, "Saved chat patterns");
  return toSave.length;
}
