/**
 * POST /api/bot/test-message
 * Генерирует сообщение бота на основе фейкового контекста.
 * Поддерживает OpenAI GPT-4o-mini и Google Gemini 2.0 Flash (бесплатно).
 *
 * GET /api/bot/test-scenarios
 * Возвращает готовые сценарии для быстрого тестирования.
 */

import { Router, type IRouter } from "express";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, chatPatternsTable, botSettingsTable } from "@workspace/db";
import { desc } from "drizzle-orm";
import { logger } from "../lib/logger";

async function loadApiSettings() {
  const rows = await db.select().from(botSettingsTable).limit(1);
  return rows[0] ?? null;
}

const router: IRouter = Router();

export const TEST_SCENARIOS = [
  {
    id: "ace_awp",
    label: "ACE с AWP",
    game_event: "Стример сделал ACE (убил всех 5 соперников) с AWP, один выстрел — одно убийство",
    streamer_speech: "ЕС-ЛИ! АУУ! Пять на пять! Вы видели это??",
    map: "de_mirage",
    situation: "Стример играет за CT, счёт 12-10 в пользу его команды",
  },
  {
    id: "clutch_1v3",
    label: "Клатч 1v3",
    game_event: "Стример выиграл клатч 1 против 3, последнего убил в ноже после того как кончились патроны",
    streamer_speech: "НОООЖ! НООЖЖЖЖ! Я в тебя верил! Четыре тысячи на ножичке!",
    map: "de_inferno",
    situation: "Последний раунд в матче, ничья 15-15",
  },
  {
    id: "streamer_died_stupid",
    label: "Глупая смерть",
    game_event: "Стример выпрыгнул из дыма и сразу получил хедшот от AWP, умер мгновенно",
    streamer_speech: "Ну всё, это пиздец... зачем я вообще это сделал",
    map: "de_nuke",
    situation: "Важный раунд, стример последний живой из команды",
  },
  {
    id: "win_round_pistol",
    label: "Победа в пистолетном",
    game_event: "Команда стримера выиграла пистолетный раунд, стример убил троих с Glock'а",
    streamer_speech: "Глок-глок! Пистолетный наш! Начало хорошее",
    map: "de_ancient",
    situation: "Начало второй половины, пистолетный раунд за T",
  },
  {
    id: "loss_eco",
    label: "Слили эко",
    game_event: "Команда стримера проиграла эко-раунд, соперники купили на сэкономленные деньги и смяли их",
    streamer_speech: "Ну и что это было... всё, теперь они миллионеры",
    map: "de_vertigo",
    situation: "Проигрываем 5-10, попытались сэкономить",
  },
  {
    id: "watching_pro",
    label: "Смотрит про-игру",
    game_event: "s1mple сделал нереальный флик с AWP через дым с полной дистанции",
    streamer_speech: "Это не человек. s1mple это не человек, я вам говорю",
    map: "de_dust2",
    situation: "Стример смотрит трансляцию мейджора",
  },
];

router.get("/bot/test-scenarios", (_req, res): void => {
  res.json(TEST_SCENARIOS);
});

const DEMO_POOLS: Record<string, string[][]> = {
  ace_awp: [
    ["ааааа", "ОРУ", "кто так делает вообще", "бог", "в топ 10 лучших моментов года"],
    ["вот это да", "нереально", "AWP бог", "красава", "ору с него"],
    ["KEKW", "топ стример", "5 пуль 5 смертей", "збс", "монстр"],
  ],
  clutch_1v3: [
    ["клатч клатч клатч", "ору", "как он это сделал", "нож в конце кек", "легенда"],
    ["это не человек", "красавчик", "1v3 как нечего делать", "монстр", "KEKW"],
    ["ааа нож!!!", "нагибатор", "вп", "збс момент", "ору с этого"],
  ],
  streamer_died_stupid: [
    ["KEKW", "ну и зачем", "классика", "всегда так", "предсказуемо"],
    ["кек", "ору", "зачем выпрыгивать из дыма", "типичный", "пг"],
    ["капец", "ну всё", "кринж", "OMEGALUL", "сам виноват кек"],
  ],
  win_round_pistol: [
    ["глок имба", "пистолетный наш", "gg", "топ раунд", "начало хорошее"],
    ["вот это начало", "кек глок убивает", "gg wp", "збс", "красава"],
    ["пистолетный зашёл", "топ", "gg", "хорошее начало", "монстр"],
  ],
  loss_eco: [
    ["ну и...", "эко провалилось", "gg", "капец", "всё как обычно"],
    ["KEKW они купили всё", "классика", "ну и ладно", "эко не зашло", "пг"],
    ["так и знал", "gg", "кек", "миллионеры KEKW", "не зашло"],
  ],
  watching_pro: [
    ["s1mple это не человек", "нереально", "топ 1 мира не зря", "ору", "как он это делает"],
    ["аниме персонаж", "бог AWP", "легенда", "нереальный флик", "збс"],
    ["ору с него", "это не человек да", "такое нельзя повторить", "монстр", "KEKW"],
  ],
};

const GENERIC_DEMO: string[][] = [
  ["топ момент", "ору", "KEKW", "красава", "нагиб"],
  ["кек", "збс", "вп", "монстр", "нереально"],
  ["ааа", "ну ты даёшь", "классно", "Pog", "👀"],
];

function pickDemoVariants(scenarioId: string, count: number, extraPatterns: string[]): string[] {
  const pool = DEMO_POOLS[scenarioId] ?? GENERIC_DEMO;
  const variants: string[] = [];
  const usedSets = new Set<number>();

  for (let i = 0; i < count; i++) {
    let setIdx = Math.floor(Math.random() * pool.length);
    if (usedSets.has(setIdx)) setIdx = (setIdx + 1) % pool.length;
    usedSets.add(setIdx);
    const words = [...pool[setIdx]];
    if (extraPatterns.length > 0 && Math.random() < 0.4) {
      const pat = extraPatterns[Math.floor(Math.random() * extraPatterns.length)];
      words.push(pat);
    }
    const idx = Math.floor(Math.random() * words.length);
    variants.push(words[idx] ?? words[0]);
  }
  return variants;
}

router.post("/bot/test-message", async (req, res): Promise<void> => {
  const {
    game_event = "",
    streamer_speech = "",
    map = "",
    situation = "",
    custom_context = "",
    count = 3,
    scenario_id = "",
  } = req.body ?? {};

  try {
    const settings = await loadApiSettings();
    const hasOpenAI = !!settings?.openaiApiKey;
    const hasGemini = !!settings?.geminiApiKey;

    if (!hasOpenAI && !hasGemini) {
      const patternRows = await db
        .select({ content: chatPatternsTable.content, lang: chatPatternsTable.language })
        .from(chatPatternsTable)
        .orderBy(desc(chatPatternsTable.frequency))
        .limit(20);
      const ruPatterns = patternRows.filter((p) => p.lang === "ru").map((p) => p.content);

      const variants = pickDemoVariants(scenario_id, Math.min(count, 5), ruPatterns);

      res.json({
        variants,
        patterns_used: ruPatterns.slice(0, 5),
        context: { game_event, streamer_speech, map, situation },
        tokens_used: 0,
        model_used: "demo",
        demo_mode: true,
      });
      return;
    }

    // Загружаем топ-30 паттернов из обучения
    const patternRows = await db
      .select({ content: chatPatternsTable.content, type: chatPatternsTable.patternType, lang: chatPatternsTable.language })
      .from(chatPatternsTable)
      .orderBy(desc(chatPatternsTable.frequency))
      .limit(30);

    const ruPatterns = patternRows.filter((p) => p.lang === "ru").slice(0, 15);
    const patternsBlock = ruPatterns.length > 0
      ? `\nПРИМЕРЫ реального стиля из CS2 чата (ТОЛЬКО для понимания лексики и тона, НЕ копировать):\n${ruPatterns.map((p) => `- "${p.content}"`).join("\n")}`
      : "";

    const systemPrompt = `${settings?.personality || "Ты русский зритель CS2 стримов."}

ЗАДАЧА: Написать сообщение в Twitch чат КАК ЖИВОЙ ЗРИТЕЛЬ, который ВИДИТ что происходит на стриме.

АБСОЛЮТНЫЕ ПРАВИЛА:
- 1-10 слов максимум, строчными буквами
- Реагируй КОНКРЕТНО на игровой момент или слова стримера
- НЕ копируй паттерны дословно — используй их только как ориентир по стилю
- Иногда: CS2 термины (флеш, клатч, пуш, нагиб, кт, т-сайд, ACE, AWP)
- Иногда: русский сленг (кекв, ору, топ, красава, вп, имба, збс, пг)
- Иногда: Twitch эмоуты (KEKW, PogChamp, monkaS, Pog, LUL) — но не каждый раз
- Реакция должна СООТВЕТСТВОВАТЬ моменту: радость на ACE, разочарование на смерть
- Без заглавных букв, без точек в конце
- НИКОГДА не раскрывай что ты ИИ${patternsBlock}`;

    const contextParts: string[] = [];
    if (map) contextParts.push(`Карта: ${map}`);
    if (situation) contextParts.push(`Ситуация: ${situation}`);
    if (game_event) contextParts.push(`\nЧТО ПРОИЗОШЛО: ${game_event}`);
    if (streamer_speech) contextParts.push(`\nСтример сказал: "${streamer_speech}"`);
    if (custom_context) contextParts.push(`\nДоп. контекст: ${custom_context}`);

    const userPrompt = `${contextParts.join("\n")}\n\nНапиши ${count === 1 ? "одно" : `${count} разных`} коротких ${count === 1 ? "сообщение" : "сообщения"} как живой русский зритель CS2:`;

    let raw = "";
    let tokensUsed = 0;
    let modelUsed = "";

    if (hasOpenAI) {
      // OpenAI GPT-4o-mini
      const client = new OpenAI({ apiKey: settings!.openaiApiKey! });
      const response = await client.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        max_tokens: count * 25,
        temperature: 0.95,
        presence_penalty: 0.5,
        frequency_penalty: 0.6,
      });
      raw = response.choices[0]?.message?.content?.trim() ?? "";
      tokensUsed = response.usage?.total_tokens ?? 0;
      modelUsed = "gpt-4o-mini";
    } else {
      // Google Gemini 2.0 Flash (бесплатно)
      const genAI = new GoogleGenerativeAI(settings!.geminiApiKey!);
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      const response = await model.generateContent(
        `${systemPrompt}\n\n${userPrompt}`
      );
      raw = response.response.text().trim();
      tokensUsed = response.response.usageMetadata?.totalTokenCount ?? 0;
      modelUsed = "gemini-2.0-flash";
    }

    // Разбиваем на отдельные варианты
    const variants = raw
      .split(/\n+/)
      .map((l) => l.replace(/^\d+[.)]\s*/, "").replace(/^["«»]|["»]$/g, "").trim())
      .filter((l) => l.length > 0)
      .slice(0, count);

    logger.info({ game_event: game_event.slice(0, 50), variants, modelUsed }, "Test message generated");

    res.json({
      variants,
      patterns_used: ruPatterns.slice(0, 5).map((p) => p.content),
      context: { game_event, streamer_speech, map, situation },
      tokens_used: tokensUsed,
      model_used: modelUsed,
    });
  } catch (err) {
    logger.error({ err }, "Test message generation failed");
    res.status(500).json({ error: String(err) });
  }
});

export default router;
