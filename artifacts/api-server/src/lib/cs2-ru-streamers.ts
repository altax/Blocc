export interface StreamerPreset {
  channel: string;
  displayName: string;
  description: string;
  category: "entertainment" | "pro" | "variety";
  priority: number;
}

// Развлекательные русскоязычные CS2 стримеры — не про-игроки
export const RU_CS2_STREAMERS: StreamerPreset[] = [
  { channel: "rekrent",    displayName: "Рекрент",    description: "Топ рус. CS2 развлекательный стример", category: "entertainment", priority: 1 },
  { channel: "praden",     displayName: "Praden",     description: "Популярный рус. CS2 / variety",       category: "entertainment", priority: 1 },
  { channel: "buster_cs",  displayName: "Buster",     description: "Рус. CS2 развлечение, активный чат",  category: "entertainment", priority: 1 },
  { channel: "yozhyk",     displayName: "Yozhyk",     description: "Русский Twitch стример",              category: "variety",       priority: 2 },
  { channel: "papich",     displayName: "Papich",     description: "Легенда рус. Twitch",                 category: "variety",       priority: 2 },
  { channel: "destroid",   displayName: "Destroid",   description: "Рус. CS2 развлечение",                category: "entertainment", priority: 2 },
  { channel: "miker_cs",   displayName: "Miker",      description: "Рус. CS2 стример",                   category: "entertainment", priority: 2 },
  { channel: "vkill",      displayName: "vKill",      description: "Русский Twitch CS2",                  category: "entertainment", priority: 3 },
  { channel: "spamfire",   displayName: "Spamfire",   description: "Рус. CS2 развлечение",                category: "entertainment", priority: 3 },
  { channel: "nikitos_cs", displayName: "Nikitos",    description: "Рус. CS2 entertainment",              category: "entertainment", priority: 3 },
];

export function getPresetChannels(minPriority = 3): string[] {
  return RU_CS2_STREAMERS
    .filter((s) => s.priority <= minPriority)
    .map((s) => s.channel);
}

export function getEntertainmentChannels(): string[] {
  return RU_CS2_STREAMERS
    .filter((s) => s.category === "entertainment")
    .map((s) => s.channel);
}
