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

export default router;
