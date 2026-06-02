import { pgTable, text, serial, integer, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatPatternsTable = pgTable("chat_patterns", {
  id: serial("id").primaryKey(),
  sourceChannel: text("source_channel").notNull(),
  patternType: text("pattern_type").notNull(),
  content: text("content").notNull(),
  frequency: integer("frequency").notNull().default(1),
  language: text("language").notNull().default("ru"),
  game: text("game").notNull().default("cs2"),
  qualityScore: real("quality_score").notNull().default(50),
  effectivenessCount: integer("effectiveness_count").notNull().default(0),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatPatternSchema = createInsertSchema(chatPatternsTable).omit({ id: true, createdAt: true });
export type InsertChatPattern = z.infer<typeof insertChatPatternSchema>;
export type ChatPattern = typeof chatPatternsTable.$inferSelect;
