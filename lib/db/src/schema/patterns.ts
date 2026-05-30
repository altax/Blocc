import { pgTable, text, serial, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const chatPatternsTable = pgTable("chat_patterns", {
  id: serial("id").primaryKey(),
  sourceChannel: text("source_channel").notNull(),
  patternType: text("pattern_type").notNull(), // reaction | hype | question | joke | emote_combo | game_specific
  content: text("content").notNull(),
  frequency: integer("frequency").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertChatPatternSchema = createInsertSchema(chatPatternsTable).omit({ id: true, createdAt: true });
export type InsertChatPattern = z.infer<typeof insertChatPatternSchema>;
export type ChatPattern = typeof chatPatternsTable.$inferSelect;
