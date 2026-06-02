import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

/**
 * Золотые сообщения бота — те, что получили реальные реакции от чата.
 * Используются как приоритетные примеры в system prompt (аналог RLHF).
 * Заполняются автоматически через reaction-tracker.
 */
export const goldenBotMessagesTable = pgTable("golden_bot_messages", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  triggerType: text("trigger_type"),
  contextSnapshot: text("context_snapshot"),
  momentType: text("moment_type"),
  channel: text("channel"),
  reactionCount: integer("reaction_count").notNull().default(0),
  reactionScore: real("reaction_score").notNull().default(0),
  timesUsedInPrompt: integer("times_used_in_prompt").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGoldenBotMessageSchema = createInsertSchema(goldenBotMessagesTable).omit({ id: true, createdAt: true });
export type InsertGoldenBotMessage = z.infer<typeof insertGoldenBotMessageSchema>;
export type GoldenBotMessage = typeof goldenBotMessagesTable.$inferSelect;
