import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botReflectionsTable = pgTable("bot_reflections", {
  id: serial("id").primaryKey(),
  messagesAnalyzed: integer("messages_analyzed").notNull().default(0),
  avgQualityBefore: real("avg_quality_before"),
  critique: text("critique").notNull(),
  improvements: text("improvements").notNull(),
  promptDelta: text("prompt_delta"),
  triggeredBy: text("triggered_by").notNull().default("auto"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotReflectionSchema = createInsertSchema(botReflectionsTable).omit({ id: true, createdAt: true });
export type InsertBotReflection = z.infer<typeof insertBotReflectionSchema>;
export type BotReflection = typeof botReflectionsTable.$inferSelect;
