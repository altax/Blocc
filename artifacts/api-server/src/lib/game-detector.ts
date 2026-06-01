import { logger } from "./logger";

// Публичный Client-ID Twitch веб-клиента — работает без регистрации приложения
const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

interface StreamInfo {
  game_name: string | null;
  is_live: boolean;
}

const GQL_STREAM_QUERY = `
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
 * Проверяет список каналов одним батчевым GQL-запросом.
 * Twitch GQL поддерживает массив запросов в теле — это предотвращает rate-limit.
 * Возвращает Map channel → StreamInfo.
 */
export async function batchCheckGames(
  channels: string[]
): Promise<Map<string, StreamInfo>> {
  const map = new Map<string, StreamInfo>();
  if (channels.length === 0) return map;

  // Строим один батчевый запрос для всех каналов сразу
  const payload = channels.map((ch) => ({
    query: GQL_STREAM_QUERY,
    variables: { login: ch.toLowerCase() },
  }));

  try {
    const resp = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(12_000),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, channels }, "Twitch GQL batch non-OK");
      // Fallback: возвращаем всех как offline
      for (const ch of channels) map.set(ch, { game_name: null, is_live: false });
      return map;
    }

    // Twitch возвращает массив результатов в том же порядке что и запросы
    const results = (await resp.json()) as Array<{
      data?: { user?: { stream?: { game?: { name: string } | null } | null } | null };
    }>;

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const result = results[i];
      const stream = result?.data?.user?.stream;
      if (!stream) {
        map.set(ch, { game_name: null, is_live: false });
      } else {
        map.set(ch, { game_name: stream.game?.name ?? null, is_live: true });
      }
    }

    logger.info(
      {
        total: channels.length,
        live: [...map.values()].filter((v) => v.is_live).length,
        channels: [...map.entries()]
          .filter(([, v]) => v.is_live)
          .map(([ch, v]) => `${ch}(${v.game_name ?? "?"})`)
          .join(", "),
      },
      "GQL batch check complete"
    );
  } catch (err) {
    logger.warn({ err, channels }, "GQL batch request failed, marking all offline");
    for (const ch of channels) map.set(ch, { game_name: null, is_live: false });
  }

  return map;
}

/**
 * Проверяет один канал — используется для периодических проверок сессий.
 */
export async function getChannelGame(channel: string): Promise<StreamInfo> {
  const map = await batchCheckGames([channel]);
  return map.get(channel) ?? { game_name: null, is_live: false };
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
