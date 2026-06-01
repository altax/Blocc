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

export default router;
