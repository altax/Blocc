import { logger } from "./logger";

export interface StreamInfo {
  game_name: string | null;
  is_live: boolean;
}

export interface TwitchCredentials {
  clientId: string;
  oauthToken: string;
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

// ── Helix API ─────────────────────────────────────────────────────────────────

/**
 * Официальный Twitch Helix API — /helix/streams.
 * Проверяет до 100 каналов за один запрос.
 * Требует Client-ID + OAuth Bearer token (user или app access token).
 */
async function checkViaHelix(
  logins: string[],
  creds: TwitchCredentials
): Promise<Map<string, StreamInfo>> {
  const map = new Map<string, StreamInfo>();

  const token = creds.oauthToken.replace(/^oauth:/i, "");

  const params = new URLSearchParams();
  for (const login of logins) {
    params.append("user_login", login.toLowerCase());
  }
  params.set("first", "100");

  const resp = await fetch(
    `https://api.twitch.tv/helix/streams?${params.toString()}`,
    {
      headers: {
        "Client-ID": creds.clientId,
        "Authorization": `Bearer ${token}`,
      },
      signal: AbortSignal.timeout(15_000),
    }
  );

  if (!resp.ok) {
    throw new Error(`Helix HTTP ${resp.status}: ${await resp.text()}`);
  }

  const json = await resp.json() as {
    data: Array<{
      user_login: string;
      game_name: string;
      type: string;
    }>;
  };

  // Helix возвращает только ЖИВЫЕ стримы. Остальные = offline.
  const liveMap = new Map(
    json.data.map((s) => [
      s.user_login.toLowerCase(),
      { game_name: s.game_name || null, is_live: s.type === "live" },
    ])
  );

  for (const login of logins) {
    const info = liveMap.get(login.toLowerCase());
    map.set(login, info ?? { game_name: null, is_live: false });
  }

  return map;
}

// ── GQL fallback (анонимный) ──────────────────────────────────────────────────

const TWITCH_GQL_CLIENT_ID = "kimne78kx3ncx6brgo4mv6wki5h1ko";

/**
 * GQL array-запрос: один элемент массива на каждый канал.
 * Надёжнее alias-батчинга, именно так работает Twitch-фронтенд.
 */
async function checkViaGql(
  channels: string[],
  logins: string[]
): Promise<Map<string, StreamInfo>> {
  const map = new Map<string, StreamInfo>();

  const bodies = logins.map((login) => ({
    query: `{ user(login: "${login}") { stream { id game { name } } } }`,
  }));

  const resp = await fetch("https://gql.twitch.tv/gql", {
    method: "POST",
    headers: {
      "Client-ID": TWITCH_GQL_CLIENT_ID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodies),
    signal: AbortSignal.timeout(15_000),
  });

  if (!resp.ok) {
    throw new Error(`GQL HTTP ${resp.status}`);
  }

  const json = await resp.json() as Array<{
    data?: { user?: { stream?: { id?: string; game?: { name: string } | null } | null } | null };
    errors?: unknown[];
  }>;

  const responses = Array.isArray(json) ? json : [json];

  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    const r = responses[i];

    if (!r || r.errors) {
      map.set(ch, { game_name: null, is_live: false });
      continue;
    }

    const stream = r.data?.user?.stream;
    const isLive = stream != null;
    map.set(ch, {
      game_name: isLive ? (stream!.game?.name ?? null) : null,
      is_live: isLive,
    });
  }

  return map;
}

// ── Публичные функции ─────────────────────────────────────────────────────────

const HELIX_BATCH_SIZE = 100;
const GQL_BATCH_SIZE = 5;

/**
 * Проверяет онлайн-статус каналов.
 *
 * Если переданы `credentials` (Client-ID + OAuth token) — использует
 * официальный Helix API (надёжный, точный).
 *
 * Без credentials — fallback на анонимный GQL Twitch
 * (работает, но менее надёжен и может возвращать stale данные).
 */
export async function batchCheckGames(
  channels: string[],
  credentials?: TwitchCredentials
): Promise<Map<string, StreamInfo>> {
  const map = new Map<string, StreamInfo>();
  if (channels.length === 0) return map;

  const logins = channels.map((ch) => ch.toLowerCase().replace(/[^a-z0-9_]/g, ""));

  // ── Путь 1: Helix API (если есть credentials) ──────────────────────────────
  if (credentials?.clientId && credentials?.oauthToken) {
    try {
      logger.info({ total: channels.length, method: "helix" }, "Checking stream status via Helix API");

      // Helix поддерживает до 100 каналов — делаем батчи если нужно
      for (let i = 0; i < logins.length; i += HELIX_BATCH_SIZE) {
        const batchLogins = logins.slice(i, i + HELIX_BATCH_SIZE);
        const batchChannels = channels.slice(i, i + HELIX_BATCH_SIZE);

        const batchMap = await checkViaHelix(batchLogins, credentials);

        // Helix возвращает по нормализованному логину, маппим обратно на оригинальные names
        for (let j = 0; j < batchChannels.length; j++) {
          const info = batchMap.get(logins[i + j]);
          map.set(batchChannels[j], info ?? { game_name: null, is_live: false });
        }
      }

      const liveCount = [...map.values()].filter((v) => v.is_live).length;
      logger.info(
        {
          total: channels.length,
          live: liveCount,
          method: "helix",
          online: channels
            .filter((ch) => map.get(ch)?.is_live)
            .map((ch) => `${ch}(${map.get(ch)?.game_name ?? "?"})`)
            .join(", "),
        },
        "GQL check complete"
      );

      return map;
    } catch (err) {
      logger.warn({ err }, "Helix API failed, falling back to GQL");
      // Fall through to GQL
    }
  }

  // ── Путь 2: GQL fallback (анонимный) ──────────────────────────────────────
  if (credentials?.clientId && !credentials?.oauthToken) {
    logger.info("Helix skipped: no OAuth token configured, using GQL fallback");
  } else if (!credentials?.clientId) {
    logger.info("Helix skipped: no Client-ID configured, using GQL fallback");
  }

  try {
    // GQL: батчи по GQL_BATCH_SIZE, запускаем параллельно
    const batches: Array<{ channels: string[]; logins: string[] }> = [];
    for (let i = 0; i < channels.length; i += GQL_BATCH_SIZE) {
      batches.push({
        channels: channels.slice(i, i + GQL_BATCH_SIZE),
        logins: logins.slice(i, i + GQL_BATCH_SIZE),
      });
    }

    const results = await Promise.all(
      batches.map((b) => checkViaGql(b.channels, b.logins))
    );

    for (const batchMap of results) {
      for (const [ch, info] of batchMap) {
        map.set(ch, info);
      }
    }
  } catch (err) {
    logger.error({ err, channels }, "GQL fallback also failed — marking all offline");
    for (const ch of channels) {
      map.set(ch, { game_name: null, is_live: false });
    }
  }

  const liveCount = [...map.values()].filter((v) => v.is_live).length;
  logger.info(
    {
      total: channels.length,
      live: liveCount,
      method: "gql-fallback",
      online: channels
        .filter((ch) => map.get(ch)?.is_live)
        .map((ch) => `${ch}(${map.get(ch)?.game_name ?? "?"})`)
        .join(", "),
    },
    "GQL check complete"
  );

  return map;
}

export async function getChannelGame(
  channel: string,
  credentials?: TwitchCredentials
): Promise<StreamInfo> {
  const map = await batchCheckGames([channel], credentials);
  return map.get(channel) ?? { game_name: null, is_live: false };
}
