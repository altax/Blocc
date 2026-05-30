import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../logger";

let genAI: GoogleGenerativeAI | null = null;

function getClient(apiKey: string): GoogleGenerativeAI {
  if (!genAI) {
    genAI = new GoogleGenerativeAI(apiKey);
  }
  return genAI;
}

export function resetVisionClient(): void {
  genAI = null;
}

export async function analyzeFrame(
  apiKey: string,
  frameBase64: string,
  mimeType: string = "image/jpeg"
): Promise<string | null> {
  try {
    const client = getClient(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      {
        inlineData: {
          data: frameBase64,
          mimeType,
        },
      },
      "Describe what's happening in this Twitch stream screenshot in 1-2 sentences. Focus on game events, streamer reactions, funny moments, or anything noteworthy. Be concise.",
    ]);

    return result.response.text().trim();
  } catch (err) {
    logger.error({ err }, "Vision analysis failed");
    return null;
  }
}
