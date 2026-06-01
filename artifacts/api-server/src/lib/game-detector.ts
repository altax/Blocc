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
 * Единый multi-alias GQL запрос — надёжнее batch-array.
 * Структура: { ch0: user(login:"x"){stream{...}}, ch1: ... }
 * Ответ: { data: { ch0: {...}, ch1: {...} } }
 * Не требует variables, не попадает под rate-limit batch-mode.
 */
export async function batchCheckGames(
  channels: string[]
): Promise<Map<string, StreamInfo>> {
  const map = new Map<string, StreamInfo>();
  if (channels.length === 0) return map;

  // Нормализуем логины: Twitch lowercase, только a-z0-9_
  const logins = channels.map((ch) => ch.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  // Строим единый запрос с алиасами ch0..chN
  const aliases = logins.map(
    (login, i) =>
      `ch${i}: user(login: "${login}") { stream { game { name } } }`
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
      logger.warn({ status: resp.status }, "Twitch GQL multi-alias non-OK");
      for (const ch of channels) map.set(ch, { game_name: null, is_live: false });
      return map;
    }

    const result = (await resp.json()) as {
      data?: Record<string, { stream?: { game?: { name: string } | null } | null } | null>;
      errors?: unknown[];
    };

    if (result.errors) {
      logger.warn({ errors: result.errors }, "Twitch GQL returned errors");
    }

    let liveCount = 0;
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      const alias = `ch${i}`;
      const userData = result?.data?.[alias];
      const stream = userData?.stream;

      if (!stream) {
        map.set(ch, { game_name: null, is_live: false });
      } else {
        const gameName = stream.game?.name ?? null;
        map.set(ch, { game_name: gameName, is_live: true });
        liveCount++;
      }
    }

    logger.info(
      {
        total: channels.length,
        live: liveCount,
        online: channels
          .filter((ch) => map.get(ch)?.is_live)
          .map((ch) => `${ch}(${map.get(ch)?.game_name ?? "?"})`)
          .join(", "),
      },
      "GQL multi-alias check complete"
    );
  } catch (err) {
    logger.warn({ err }, "GQL multi-alias request failed — marking all offline");
    for (const ch of channels) map.set(ch, { game_name: null, is_live: false });
  }

  return map;
}

export async function getChannelGame(channel: string): Promise<StreamInfo> {
  const map = await batchCheckGames([channel]);
  return map.get(channel) ?? { game_name: null, is_live: false };
}
