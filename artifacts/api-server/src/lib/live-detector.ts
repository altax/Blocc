import * as net from "net";
import { logger } from "./logger";

export interface ChannelActivity {
  channel: string;
  message_count: number;
  is_live: boolean;
  messages_per_minute: number;
}

/**
 * Подключается ко всем каналам одновременно через IRC.
 * Считает количество сообщений за windowMs мс.
 * Каналы с >5 сообщений считаются живыми.
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

  // Подключаемся ко всем каналам параллельно
  await Promise.allSettled(channels.map(connectChannel));

  // Ждём окно наблюдения
  await new Promise((r) => setTimeout(r, windowMs));

  // Закрываем все сокеты
  for (const [, socket] of sockets) {
    try { socket.destroy(); } catch { /* ignore */ }
  }

  const windowMinutes = windowMs / 60_000;

  const results: ChannelActivity[] = channels.map((channel) => {
    const count = counts.get(channel) ?? 0;
    return {
      channel,
      message_count: count,
      is_live: count >= 5,
      messages_per_minute: Math.round(count / windowMinutes),
    };
  });

  // Сортируем по активности
  results.sort((a, b) => b.message_count - a.message_count);

  logger.info({ results }, "Live detection complete");
  return results;
}
