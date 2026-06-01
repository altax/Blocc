import * as net from "net";
import { logger } from "./logger";
import { batchCheckGames, isCS2Game } from "./game-detector";

export interface ChannelActivity {
  channel: string;
  message_count: number;
  is_live: boolean;
  messages_per_minute: number;
  game_name: string | null;
  is_cs2: boolean;
}

/**
 * Подключается ко всем каналам одновременно через IRC.
 * Считает количество сообщений за windowMs мс.
 * Параллельно проверяет через Twitch GQL статус онлайн для ВСЕХ каналов.
 * GQL является основным источником правды об онлайне.
 * IRC-активность используется только как дополнительная метрика.
 */
export async function detectLiveChannels(
  channels: string[],
  windowMs = 30_000
): Promise<ChannelActivity[]> {
  const counts = new Map<string, number>(channels.map((c) => [c, 0]));
  const sockets = new Map<string, net.Socket>();

  const connectChannel = (channel: string): Promise<void> => {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      let buffer = "";

      socket.connect(6667, "irc.chat.twitch.tv", () => {
        socket.write("PASS SCHMOOPIIE\r\n");
        socket.write(`NICK justinfan${Math.floor(Math.random() * 99999)}\r\n`);
        socket.write(`JOIN #${channel.toLowerCase()}\r\n`);
        resolve();
      });

      socket.on("data", (data) => {
        buffer += data.toString();
        const lines = buffer.split("\r\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (line.startsWith("PING")) {
            socket.write(`PONG${line.slice(4)}\r\n`);
          }
          if (line.includes("PRIVMSG")) {
            counts.set(channel, (counts.get(channel) ?? 0) + 1);
          }
        }
      });

      socket.on("error", () => resolve());
      sockets.set(channel, socket);
    });
  };

  // Запускаем IRC-мониторинг и GQL-проверку параллельно
  const [, gameMap] = await Promise.all([
    // IRC: подключаемся ко всем каналам и слушаем windowMs
    Promise.allSettled(channels.map(connectChannel)).then(() =>
      new Promise<void>((r) => setTimeout(r, windowMs))
    ),
    // GQL: проверяем онлайн-статус ВСЕХ каналов (не только с IRC-активностью)
    batchCheckGames(channels),
  ]);

  // Закрываем все IRC-сокеты
  for (const [, socket] of sockets) {
    try { socket.destroy(); } catch { /* ignore */ }
  }

  const windowMinutes = windowMs / 60_000;

  const results: ChannelActivity[] = channels.map((channel) => {
    const count = counts.get(channel) ?? 0;
    const gameInfo = gameMap.get(channel);

    // GQL — основной источник правды об онлайне
    const isLive = gameInfo?.is_live ?? false;
    const gameName = gameInfo?.game_name ?? null;

    return {
      channel,
      message_count: count,
      is_live: isLive,
      messages_per_minute: Math.round(count / windowMinutes),
      game_name: gameName,
      is_cs2: isLive ? isCS2Game(gameName) : false,
    };
  });

  // Сортируем: сначала CS2-онлайн, потом другие онлайн, потом оффлайн
  results.sort((a, b) => {
    if (a.is_cs2 !== b.is_cs2) return a.is_cs2 ? -1 : 1;
    if (a.is_live !== b.is_live) return a.is_live ? -1 : 1;
    return b.message_count - a.message_count;
  });

  logger.info(
    { results: results.map((r) => ({ ch: r.channel, live: r.is_live, cs2: r.is_cs2, game: r.game_name, msgs: r.message_count })) },
    "Live detection complete (GQL primary)"
  );
  return results;
}
