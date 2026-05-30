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

router.get("/settings", async (req, res): Promise<void> => {
  const settings = await getOrCreateSettings();
  res.json({
    ...settings,
    created_at: settings.createdAt.toISOString(),
    updated_at: settings.updatedAt.toISOString(),
    channel_name: settings.channelName,
    bot_username: settings.botUsername,
    min_delay_seconds: settings.minDelaySeconds,
    max_delay_seconds: settings.maxDelaySeconds,
    cooldown_seconds: settings.cooldownSeconds,
    respond_to_chat: settings.respondToChat,
    vision_enabled: settings.visionEnabled,
    speech_enabled: settings.speechEnabled,
    active_hours_start: settings.activeHoursStart,
    active_hours_end: settings.activeHoursEnd,
  });
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

  res.json({
    ...updated,
    created_at: updated.createdAt.toISOString(),
    updated_at: updated.updatedAt.toISOString(),
    channel_name: updated.channelName,
    bot_username: updated.botUsername,
    min_delay_seconds: updated.minDelaySeconds,
    max_delay_seconds: updated.maxDelaySeconds,
    cooldown_seconds: updated.cooldownSeconds,
    respond_to_chat: updated.respondToChat,
    vision_enabled: updated.visionEnabled,
    speech_enabled: updated.speechEnabled,
    active_hours_start: updated.activeHoursStart,
    active_hours_end: updated.activeHoursEnd,
  });
});

export default router;
