import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botMessagesTable = pgTable("bot_messages", {
  id: serial("id").primaryKey(),
  channel: text("channel").notNull(),
  message: text("message").notNull(),
  triggerType: text("trigger_type").notNull(),
  contextSummary: text("context_summary"),
  qualityScore: integer("quality_score"),
  qualityBreakdown: text("quality_breakdown"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotMessageSchema = createInsertSchema(botMessagesTable).omit({ id: true, createdAt: true });
export type InsertBotMessage = z.infer<typeof insertBotMessageSchema>;
export type BotMessage = typeof botMessagesTable.$inferSelect;
