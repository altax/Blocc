import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../logger";
import { updateGameState } from "./game-state-machine";

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

/**
 * Структурированный CS2-промпт вместо "describe what you see in 1-2 sentences".
 * Возвращает JSON с game state + текстовое описание для чата.
 */
const CS2_VISION_PROMPT = `You are analyzing a CS2 (Counter-Strike 2) Twitch stream screenshot.

Extract the following information and return a JSON object:
{
  "round_phase": "warmup|buy|fight|planted|end|halftime|overtime|unknown",
  "moment_type": "ace|clutch|bomb_planted|bomb_defused|knife_kill|headshot|death|eco_win|pistol_round|awp_highlight|win|loss|normal",
  "moment_intensity": 0-10,
  "ct_score": number or null,
  "t_score": number or null,
  "map": "de_mirage|de_inferno|de_nuke|de_ancient|de_anubis|de_vertigo|de_dust2|de_overpass|unknown",
  "streamer_hp": number or null,
  "bomb_planted": true|false,
  "is_clutch": true|false,
  "description": "1-2 sentence description of what's happening, focused on exciting/notable events"
}

Rules:
- moment_intensity: 10=ace/1v5 clutch, 9=1v3+/bomb defuse, 8=knife/eco win, 7=bomb planted/1v2, 5-6=win/loss/pistol, 3-4=death, 1-2=normal play, 0=menu/loading
- description: write in present tense, focus on what would excite chat ("streamer getting a crazy 4k on mirage mid" not "player is moving around the map")
- If you cannot determine a field, use null or "unknown"
- Return ONLY the JSON object, no markdown, no explanation`;

interface VisionResult {
  description: string;
  momentIntensity: number;
  momentType: string;
  gameStateRaw: Record<string, unknown>;
}

async function parseVisionResponse(text: string): Promise<VisionResult | null> {
  try {
    const clean = text.replace(/```json\n?|```\n?/g, "").trim();
    // Find JSON object
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const json = JSON.parse(jsonMatch[0]);
    return {
      description: String(json.description ?? ""),
      momentIntensity: Math.min(10, Math.max(0, Number(json.moment_intensity) || 0)),
      momentType: String(json.moment_type ?? "normal"),
      gameStateRaw: json,
    };
  } catch {
    return null;
  }
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
      { inlineData: { data: frameBase64, mimeType } },
      CS2_VISION_PROMPT,
    ]);

    const rawText = result.response.text().trim();
    const parsed = await parseVisionResponse(rawText);

    if (parsed) {
      // Обновляем game state machine
      const fullDescription = buildDescriptionForGameState(parsed);
      updateGameState(fullDescription);

      logger.info(
        { momentType: parsed.momentType, intensity: parsed.momentIntensity },
        "Vision frame analyzed"
      );

      return parsed.description || rawText;
    }

    // Fallback — если JSON не распарсился, пробуем вытащить description напрямую
    updateGameState(rawText);
    return rawText;
  } catch (err) {
    logger.error({ err }, "Vision analysis failed");
    return null;
  }
}

function buildDescriptionForGameState(parsed: VisionResult): string {
  const parts: string[] = [parsed.description];
  const raw = parsed.gameStateRaw;

  if (raw.moment_type && raw.moment_type !== "normal") parts.push(String(raw.moment_type));
  if (raw.ct_score != null && raw.t_score != null) parts.push(`${raw.ct_score}-${raw.t_score}`);
  if (raw.map && raw.map !== "unknown") parts.push(String(raw.map));
  if (raw.bomb_planted === true) parts.push("bomb planted");
  if (raw.is_clutch === true) parts.push("clutch");

  return parts.join(" ");
}

/**
 * Быстрый анализ фрейма только для определения интенсивности момента.
 * Дешевле полного анализа — используется для горячего триггера.
 */
export async function quickIntensityCheck(
  apiKey: string,
  frameBase64: string,
  mimeType: string = "image/jpeg"
): Promise<number> {
  try {
    const client = getClient(apiKey);
    const model = client.getGenerativeModel({ model: "gemini-2.0-flash" });

    const result = await model.generateContent([
      { inlineData: { data: frameBase64, mimeType } },
      `Rate the excitement level of this CS2 stream moment from 0-10. 10=ace/1v5, 9=clutch, 8=knife, 7=bomb, 5=win, 3=death, 1=walking, 0=menu. Reply ONLY with a single integer.`,
    ]);

    const text = result.response.text().trim();
    const num = parseInt(text, 10);
    return isNaN(num) ? 0 : Math.min(10, Math.max(0, num));
  } catch {
    return 0;
  }
}
