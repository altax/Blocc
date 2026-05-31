import { logger } from "./logger";

// Публичный Client-ID Twitch веб-клиента — работает без регистрации приложения
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

interface StreamInfo {
  game_name: string | null;
  is_live: boolean;
}

const GQL_QUERY = `
  query StreamInfo($login: String!) {
    user(login: $login) {
      stream {
        game {
          name
        }
      }
    }
  }
`;

/**
 * Запрашивает через Twitch GQL что сейчас стримит канал.
 * Возвращает название игры или null если канал оффлайн / ошибка.
 */
export async function getChannelGame(channel: string): Promise<StreamInfo> {
  try {
    const resp = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: GQL_QUERY, variables: { login: channel.toLowerCase() } }),
      signal: AbortSignal.timeout(8_000),
    });

    if (!resp.ok) {
      logger.warn({ channel, status: resp.status }, "Twitch GQL non-OK response");
      return { game_name: null, is_live: false };
    }

    const data = (await resp.json()) as {
      data?: { user?: { stream?: { game?: { name: string } | null } | null } | null };
    };

    const stream = data?.data?.user?.stream;
    if (!stream) return { game_name: null, is_live: false };

    const game_name = stream.game?.name ?? null;
    return { game_name, is_live: true };
  } catch (err) {
    logger.warn({ err, channel }, "Failed to get channel game");
    return { game_name: null, is_live: false };
  }
}

/** Имена игры CS2 на Twitch */
const CS2_GAME_NAMES = new Set([
  "Counter-Strike 2",
  "Counter-Strike: Global Offensive",
  "Counter-Strike",
]);

export function isCS2Game(game_name: string | null): boolean {
  if (!game_name) return false;
  return CS2_GAME_NAMES.has(game_name);
}

/**
 * Проверяет список каналов параллельно.
 * Возвращает Map channel → StreamInfo.
 */
export async function batchCheckGames(
  channels: string[]
): Promise<Map<string, StreamInfo>> {
  const results = await Promise.allSettled(
    channels.map(async (ch) => ({ ch, info: await getChannelGame(ch) }))
  );

  const map = new Map<string, StreamInfo>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      map.set(r.value.ch, r.value.info);
    }
  }
  return map;
}
