import OpenAI from "openai";
import { logger } from "../logger";

let openaiClient: OpenAI | null = null;

function getClient(apiKey: string): OpenAI {
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

export function resetClient(): void {
  openaiClient = null;
}

export async function generateChatMessage(
  apiKey: string,
  personality: string,
  contextString: string,
  triggerType: string
): Promise<string | null> {
  try {
    const client = getClient(apiKey);

    const systemPrompt = `${personality}

CRITICAL RULES:
- Write ONLY a single short chat message (1-15 words max)
- Sound like a real person, NOT an AI
- No punctuation at the end unless it's "?" or "!"
- Use lowercase for casual feel, only capitalize proper nouns
- Occasionally use Twitch emotes like PogChamp, LUL, KEKW, Pog, monkaS, OMEGALUL, pepega, copium, 4Head, EZ, Clap, peepoHappy, peepoSad — but not always
- Never start with "I think" or formal openers
- React naturally to what's happening
- If nothing interesting is happening, sometimes just react with an emote or skip
- NEVER reveal you are an AI
- Output ONLY the message text, nothing else`;

    const userPrompt = `Current stream context:\n${contextString}\n\nTrigger: ${triggerType}\n\nWrite a natural chat message as a real viewer:`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 60,
      temperature: 0.9,
    });

    const message = response.choices[0]?.message?.content?.trim();
    if (!message) return null;

    // Clean up any quotes the model might add
    return message.replace(/^["']|["']$/g, "").trim();
  } catch (err) {
    logger.error({ err }, "Failed to generate chat message");
    return null;
  }
}

export async function shouldRespond(
  apiKey: string,
  contextString: string,
  cooldownActive: boolean
): Promise<boolean> {
  if (cooldownActive) return false;

  try {
    const client = getClient(apiKey);
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are deciding whether a Twitch viewer should write a chat message right now. Respond with only 'yes' or 'no'. Reply 'yes' only if something interesting, funny, exciting, or noteworthy is happening. Reply 'no' if the stream is calm or boring.",
        },
        {
          role: "user",
          content: `Context:\n${contextString}\n\nShould a viewer send a chat message right now?`,
        },
      ],
      max_tokens: 5,
      temperature: 0.3,
    });

    const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
    return answer === "yes";
  } catch {
    return Math.random() < 0.3;
  }
}
