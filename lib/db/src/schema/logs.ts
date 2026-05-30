import { pgTable, text, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botLogsTable = pgTable("bot_logs", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // vision | speech | chat | decision | message_sent | error
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotLogSchema = createInsertSchema(botLogsTable).omit({ id: true, createdAt: true });
export type InsertBotLog = z.infer<typeof insertBotLogSchema>;
export type BotLog = typeof botLogsTable.$inferSelect;
