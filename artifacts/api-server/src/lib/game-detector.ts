import { logger } from "./logger";

const TWITCH_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

export interface StreamInfo {
  game_name: string | null;
  is_live: boolean;
}

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
 * Проверяет небольшой батч (≤5) каналов одним GQL запросом с алиасами.
 */
async function checkBatch(
  channels: string[],
  logins: string[]
): Promise<Map<string, StreamInfo>> {
  const map = new Map<string, StreamInfo>();

  const aliases = logins.map(
    (login, i) =>
      `ch${i}: user(login: "${login}") { stream { id game { name } } }`
  );
  const query = `{ ${aliases.join(" ")} }`;

  try {
    const resp = await fetch("https://gql.twitch.tv/gql", {
      method: "POST",
      headers: {
        "Client-ID": TWITCH_CLIENT_ID,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!resp.ok) {
      logger.warn({ status: resp.status, channels }, "Twitch GQL batch non-OK");
      for (const ch of channels) map.set(ch, { game_name: null, is_live: false });
      return map;
    }

    const result = (await resp.json()) as {
      data?: Record<string, { stream?: { id?: string; game?: { name: string } | null } | null } | null>;
      errors?: unknown[];
    };

    if (result.errors) {
      logger.warn({ errors: result.errors, channels }, "Twitch GQL batch errors");
    }

    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const userData = result?.data?.[`ch${i}`];
      const stream = userData?.stream;
      // stream non-null + id присутствует → канал реально стримит
      const isLive = !!stream && !!stream.id;
      const gameName = isLive ? (stream!.game?.name ?? null) : null;
      map.set(ch, { game_name: gameName, is_live: isLive });
    }
  } catch (err) {
    logger.warn({ err, channels }, "GQL batch request failed — marking offline");
    for (const ch of channels) map.set(ch, { game_name: null, is_live: false });
  }

  return map;
}

/**
 * Параллельные GQL запросы батчами по BATCH_SIZE каналов.
 * Маленькие батчи снижают вероятность частичного отказа со стороны Twitch.
 */
const BATCH_SIZE = 4;

export async function batchCheckGames(
  channels: string[]
): Promise<Map<string, StreamInfo>> {
  const map = new Map<string, StreamInfo>();
  if (channels.length === 0) return map;

  // Нормализуем логины: Twitch lowercase, только a-z0-9_
  const logins = channels.map((ch) => ch.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  // Делим на батчи по BATCH_SIZE и запускаем параллельно
  const batches: Array<{ channels: string[]; logins: string[] }> = [];
  for (let i = 0; i < channels.length; i += BATCH_SIZE) {
    batches.push({
      channels: channels.slice(i, i + BATCH_SIZE),
      logins: logins.slice(i, i + BATCH_SIZE),
    });
  }

  const results = await Promise.all(
    batches.map((b) => checkBatch(b.channels, b.logins))
  );

  for (const batchMap of results) {
    for (const [ch, info] of batchMap) {
      map.set(ch, info);
    }
  }

  const liveCount = [...map.values()].filter((v) => v.is_live).length;
  logger.info(
    {
      total: channels.length,
      live: liveCount,
      online: channels
        .filter((ch) => map.get(ch)?.is_live)
        .map((ch) => `${ch}(${map.get(ch)?.game_name ?? "?"})`)
        .join(", "),
    },
    "GQL check complete"
  );

  return map;
}

export async function getChannelGame(channel: string): Promise<StreamInfo> {
  const map = await batchCheckGames([channel]);
  return map.get(channel) ?? { game_name: null, is_live: false };
}
