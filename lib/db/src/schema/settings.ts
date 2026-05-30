import { pgTable, text, serial, boolean, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botSettingsTable = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  channelName: text("channel_name").notNull().default(""),
  botUsername: text("bot_username").notNull().default(""),
  twitchOauthToken: text("twitch_oauth_token").notNull().default(""),
  openaiApiKey: text("openai_api_key").notNull().default(""),
  geminiApiKey: text("gemini_api_key").notNull().default(""),
  personality: text("personality").notNull().default("You are a regular Twitch viewer. Write short, casual chat messages like a real person watching a stream. React naturally to what's happening. Be authentic, human, and occasionally use common Twitch slang. Never reveal you are an AI."),
  minDelaySeconds: integer("min_delay_seconds").notNull().default(5),
  maxDelaySeconds: integer("max_delay_seconds").notNull().default(25),
  cooldownSeconds: integer("cooldown_seconds").notNull().default(120),
  respondToChat: boolean("respond_to_chat").notNull().default(true),
  visionEnabled: boolean("vision_enabled").notNull().default(true),
  speechEnabled: boolean("speech_enabled").notNull().default(true),
  activeHoursStart: integer("active_hours_start"),
  activeHoursEnd: integer("active_hours_end"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBotSettingsSchema = createInsertSchema(botSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;
export type BotSettings = typeof botSettingsTable.$inferSelect;
