import { db } from "@workspace/db";
import { botLogsTable, botMessagesTable, chatPatternsTable, botSettingsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { getBotState, setBotRunning, incrementMessagesSent, setLastAction, getUptimeSeconds } from "../bot-state";
import { TwitchIrcClient } from "./twitch-irc";
import { buildContextString, addChatMessage, addBotMessage, addVisionSummary, addSpeechTranscript, getContext } from "./context-builder";
import { generateChatMessage, shouldRespond } from "./response-generator";
import { logger } from "../logger";

let ircClient: TwitchIrcClient | null = null;
let decisionTimer: NodeJS.Timeout | null = null;
let lastMessageAt = 0;

async function log(type: string, content: string, metadata?: string): Promise<void> {
  try {
    await db.insert(botLogsTable).values({ type, content, metadata: metadata ?? null });
  } catch (err) {
    logger.error({ err }, "Failed to insert log");
  }
}

async function getSettings() {
  const rows = await db.select().from(botSettingsTable).limit(1);
  return rows[0] ?? null;
}

async function getRecentPatterns(): Promise<string[]> {
  const rows = await db
    .select({ content: chatPatternsTable.content })
    .from(chatPatternsTable)
    .orderBy(desc(chatPatternsTable.frequency))
    .limit(30);
  return rows.map((r) => r.content);
}

async function runDecisionLoop(): Promise<void> {
  const settings = await getSettings();
  if (!settings || !getBotState().running) return;

  const now = Date.now();
  const cooldownMs = settings.cooldownSeconds * 1000;

  if (now - lastMessageAt < cooldownMs) {
    return; // still in cooldown
  }

  try {
    const patterns = await getRecentPatterns();
    const contextStr = buildContextString(patterns);

    const cooldownActive = now - lastMessageAt < cooldownMs;
    const should = await shouldRespond(settings.openaiApiKey, contextStr, cooldownActive);

    await log("decision", should ? "Decided to send a message" : "Decided to stay silent", contextStr.slice(0, 500));

    if (!should) return;

    const context = getContext();
    const triggerType = context.recentSpeech.length > context.recentVisionSummaries.length ? "speech" : "vision";

    const message = await generateChatMessage(
      settings.openaiApiKey,
      settings.personality,
      contextStr,
      triggerType
    );

    if (!message) return;

    // Apply random human-like delay
    const minDelay = settings.minDelaySeconds * 1000;
    const maxDelay = settings.maxDelaySeconds * 1000;
    const delay = Math.floor(Math.random() * (maxDelay - minDelay)) + minDelay;

    await new Promise((r) => setTimeout(r, delay));

    if (!getBotState().running) return; // stopped during delay

    ircClient?.sendMessage(message);
    lastMessageAt = Date.now();
    incrementMessagesSent();
    setLastAction(`Sent: "${message}"`);
    addBotMessage(message);

    await log("message_sent", message, JSON.stringify({ triggerType, delay }));
    await db.insert(botMessagesTable).values({
      channel: settings.channelName,
      message,
      triggerType,
      contextSummary: contextStr.slice(0, 300),
    });
  } catch (err) {
    logger.error({ err }, "Decision loop error");
    await log("error", `Decision loop error: ${String(err)}`);
  }
}

export async function startBot(): Promise<void> {
  if (getBotState().running) return;

  const settings = await getSettings();
  if (!settings) throw new Error("No settings configured");
  if (!settings.channelName) throw new Error("Channel name not set");
  if (!settings.openaiApiKey) throw new Error("OpenAI API key not set");

  setBotRunning(true, settings.channelName);
  await log("decision", `Bot started for channel: ${settings.channelName}`);

  // Connect to Twitch IRC
  ircClient = new TwitchIrcClient({
    username: settings.botUsername || "justinfan" + Math.floor(Math.random() * 99999),
    oauthToken: settings.twitchOauthToken || "SCHMOOPIIE",
    channel: settings.channelName,
    onMessage: (username, message) => {
      if (username.toLowerCase() === (settings.botUsername || "").toLowerCase()) return;
      addChatMessage(username, message);
    },
    onConnected: () => {
      log("decision", `Connected to #${settings.channelName} IRC`);
    },
    onDisconnected: () => {
      log("error", "Disconnected from IRC");
    },
  });

  try {
    await ircClient.connect();
  } catch (err) {
    logger.warn({ err }, "IRC connection failed, running in offline mode");
    await log("error", `IRC connect failed: ${String(err)} — running in simulation mode`);
  }

  // Decision loop every 15 seconds
  decisionTimer = setInterval(runDecisionLoop, 15_000);
}

export async function stopBot(): Promise<void> {
  setBotRunning(false);
  if (decisionTimer) {
    clearInterval(decisionTimer);
    decisionTimer = null;
  }
  ircClient?.disconnect();
  ircClient = null;
  await log("decision", "Bot stopped");
}

export function getBotStatusPayload() {
  const state = getBotState();
  return {
    running: state.running,
    channel: state.channel,
    uptime_seconds: getUptimeSeconds(),
    messages_sent: state.messagesSent,
    last_action: state.lastAction,
  };
}
