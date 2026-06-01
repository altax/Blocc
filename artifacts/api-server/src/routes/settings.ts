import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { botSettingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

async function getOrCreateSettings() {
  const rows = await db.select().from(botSettingsTable).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(botSettingsTable).values({}).returning();
  return created;
}

function serializeSettings(s: typeof botSettingsTable.$inferSelect) {
  return {
    id: s.id,
    channel_name: s.channelName,
    bot_username: s.botUsername,
    twitch_oauth_token: s.twitchOauthToken,
    twitch_client_id: s.twitchClientId,
    twitch_client_secret: s.twitchClientSecret,
    openai_api_key: s.openaiApiKey,
    gemini_api_key: s.geminiApiKey,
    personality: s.personality,
    min_delay_seconds: s.minDelaySeconds,
    max_delay_seconds: s.maxDelaySeconds,
    cooldown_seconds: s.cooldownSeconds,
    respond_to_chat: s.respondToChat,
    vision_enabled: s.visionEnabled,
    speech_enabled: s.speechEnabled,
    active_hours_start: s.activeHoursStart,
    active_hours_end: s.activeHoursEnd,
    created_at: s.createdAt.toISOString(),
    updated_at: s.updatedAt.toISOString(),
  };
}

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json(serializeSettings(settings));
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const settings = await getOrCreateSettings();

  const updateData: Partial<typeof botSettingsTable.$inferInsert> = {};
  const d = parsed.data;

  if (d.channel_name !== undefined) updateData.channelName = d.channel_name;
  if (d.bot_username !== undefined) updateData.botUsername = d.bot_username;
  if (d.twitch_oauth_token !== undefined) updateData.twitchOauthToken = d.twitch_oauth_token;
  if (d.twitch_client_id !== undefined) updateData.twitchClientId = d.twitch_client_id;
  if (d.twitch_client_secret !== undefined) updateData.twitchClientSecret = d.twitch_client_secret;
  if (d.openai_api_key !== undefined) updateData.openaiApiKey = d.openai_api_key;
  if (d.gemini_api_key !== undefined) updateData.geminiApiKey = d.gemini_api_key;
  if (d.personality !== undefined) updateData.personality = d.personality;
  if (d.min_delay_seconds !== undefined) updateData.minDelaySeconds = d.min_delay_seconds;
  if (d.max_delay_seconds !== undefined) updateData.maxDelaySeconds = d.max_delay_seconds;
  if (d.cooldown_seconds !== undefined) updateData.cooldownSeconds = d.cooldown_seconds;
  if (d.respond_to_chat !== undefined) updateData.respondToChat = d.respond_to_chat;
  if (d.vision_enabled !== undefined) updateData.visionEnabled = d.vision_enabled;
  if (d.speech_enabled !== undefined) updateData.speechEnabled = d.speech_enabled;
  if (d.active_hours_start !== undefined) updateData.activeHoursStart = d.active_hours_start;
  if (d.active_hours_end !== undefined) updateData.activeHoursEnd = d.active_hours_end;

  const [updated] = await db
    .update(botSettingsTable)
    .set(updateData)
    .where(eq(botSettingsTable.id, settings.id))
    .returning();

  res.json(serializeSettings(updated));
});

router.post("/settings/verify-twitch", async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();

  if (!s.twitchClientId) {
    res.status(400).json({ ok: false, error: "Client ID не указан" });
    return;
  }

  if (!s.twitchClientSecret) {
    res.status(400).json({ ok: false, error: "Client Secret не указан" });
    return;
  }

  try {
    // 1. Получаем App Access Token
    const params = new URLSearchParams({
      client_id: s.twitchClientId,
      client_secret: s.twitchClientSecret,
      grant_type: "client_credentials",
    });

    const tokenResp = await fetch(
      `https://id.twitch.tv/oauth2/token?${params.toString()}`,
      { method: "POST", signal: AbortSignal.timeout(10_000) }
    );

    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      res.status(400).json({ ok: false, error: `Ошибка токена (${tokenResp.status}): ${text}` });
      return;
    }

    const { access_token } = await tokenResp.json() as { access_token: string };

    // 2. Проверяем несколько стримеров через Helix
    const testChannels = ["strogo", "rekrent", "s1mple", "shadowkek", "ct0m"];
    const helixParams = new URLSearchParams();
    for (const ch of testChannels) helixParams.append("user_login", ch);
    helixParams.set("first", "20");

    const helixResp = await fetch(
      `https://api.twitch.tv/helix/streams?${helixParams.toString()}`,
      {
        headers: {
          "Client-ID": s.twitchClientId,
          "Authorization": `Bearer ${access_token}`,
        },
        signal: AbortSignal.timeout(10_000),
      }
    );

    if (!helixResp.ok) {
      const text = await helixResp.text();
      res.status(400).json({ ok: false, error: `Ошибка Helix (${helixResp.status}): ${text}` });
      return;
    }

    const helixData = await helixResp.json() as { data: Array<{ user_login: string; game_name: string; type: string }> };
    const live = helixData.data
      .filter(s => s.type === "live")
      .map(s => `${s.user_login} (${s.game_name || "?"})`);

    res.json({
      ok: true,
      token_received: true,
      checked_channels: testChannels,
      live_count: live.length,
      live_channels: live,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Неизвестная ошибка" });
  }
});

// Twitch Device Flow — шаг 1: инициализация
router.post("/settings/twitch-device-flow/start", async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  const clientId = (req.body as any)?.client_id || s.twitchClientId;

  if (!clientId) {
    res.status(400).json({ ok: false, error: "Client ID не указан. Сначала сохрани его в настройках." });
    return;
  }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      scopes: "chat:read chat:edit",
    });

    const resp = await fetch("https://id.twitch.tv/oauth2/device", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await resp.json() as any;

    if (!resp.ok) {
      res.status(400).json({ ok: false, error: data?.message || `Ошибка Twitch (${resp.status})` });
      return;
    }

    res.json({
      ok: true,
      device_code: data.device_code,
      user_code: data.user_code,
      verification_uri: data.verification_uri,
      expires_in: data.expires_in,
      interval: data.interval ?? 5,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Неизвестная ошибка" });
  }
});

// Twitch Device Flow — шаг 2: опрос статуса и сохранение токена
router.post("/settings/twitch-device-flow/poll", async (req, res): Promise<void> => {
  const { device_code } = req.body as { device_code?: string };
  const s = await getOrCreateSettings();

  if (!device_code) {
    res.status(400).json({ ok: false, error: "device_code не указан" });
    return;
  }

  if (!s.twitchClientId) {
    res.status(400).json({ ok: false, error: "Client ID не указан" });
    return;
  }

  try {
    const body = new URLSearchParams({
      client_id: s.twitchClientId,
      device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    if (s.twitchClientSecret) {
      body.set("client_secret", s.twitchClientSecret);
    }

    const resp = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(10_000),
    });

    const data = await resp.json() as any;

    if (resp.status === 400 && (data?.message === "authorization_pending" || data?.status === 400)) {
      res.json({ ok: false, pending: true });
      return;
    }

    if (!resp.ok) {
      const errMsg = data?.message || data?.error_description || `Ошибка (${resp.status})`;
      res.status(400).json({ ok: false, error: errMsg });
      return;
    }

    const token = `oauth:${data.access_token}`;

    await db
      .update(botSettingsTable)
      .set({ twitchOauthToken: token })
      .where(eq(botSettingsTable.id, s.id));

    res.json({ ok: true, token });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Неизвестная ошибка" });
  }
});

// Проверка валидности OAuth токена через /oauth2/validate
router.post("/settings/verify-oauth-token", async (req, res): Promise<void> => {
  const s = await getOrCreateSettings();
  const token = s.twitchOauthToken;

  if (!token) {
    res.status(400).json({ ok: false, error: "OAuth токен не указан в настройках" });
    return;
  }

  try {
    const rawToken = token.replace(/^oauth:/i, "");
    const resp = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { "Authorization": `OAuth ${rawToken}` },
      signal: AbortSignal.timeout(10_000),
    });

    const data = await resp.json() as any;

    if (!resp.ok) {
      res.json({ ok: false, error: data?.message ?? `Невалидный токен (${resp.status})` });
      return;
    }

    const scopes: string[] = data.scopes ?? [];
    const hasChatRead = scopes.includes("chat:read");
    const hasChatEdit = scopes.includes("chat:edit");

    res.json({
      ok: true,
      login: data.login ?? null,
      user_id: data.user_id ?? null,
      scopes,
      has_chat_read: hasChatRead,
      has_chat_edit: hasChatEdit,
      expires_in: data.expires_in ?? null,
    });
  } catch (err: any) {
    res.status(500).json({ ok: false, error: err?.message ?? "Ошибка сети" });
  }
});

export default router;
