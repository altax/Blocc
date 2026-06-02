export interface StreamerPreset {
  channel: string;
  displayName: string;
  description: string;
  category: "entertainment" | "pro" | "variety";
  priority: number;
}

// Список выбранных русскоязычных стримеров CS2/variety — развлечение, не только про
export const RU_CS2_STREAMERS: StreamerPreset[] = [
  { channel: "strogo",       displayName: "StRoGo",       description: "Рус. CS2 развлекательный стример",    category: "entertainment", priority: 1 },
  { channel: "shadowkek",    displayName: "Shadowkek",    description: "Рус. CS2 / variety, живой чат",        category: "entertainment", priority: 1 },
  { channel: "dmitry_lixxx", displayName: "Dmitry_Lixxx", description: "Рус. CS2 стример",                    category: "entertainment", priority: 1 },
  { channel: "ct0m",         displayName: "ct0m",         description: "Рус. CS2 стример",                    category: "entertainment", priority: 1 },
  { channel: "skywhywalker", displayName: "Skywhywalker", description: "Рус. Twitch / CS2",                   category: "variety",       priority: 2 },
  { channel: "buster_cs",    displayName: "Buster",       description: "Рус. CS2 развлечение, активный чат",  category: "entertainment", priority: 2 },
  { channel: "evelone192",   displayName: "Evelone",      description: "Легенда рус. Twitch, variety",         category: "variety",       priority: 2 },
  { channel: "mokrivskiy",   displayName: "Mokrivskiy",   description: "Рус. CS2 стример",                    category: "entertainment", priority: 2 },
  { channel: "s1mple",       displayName: "s1mple",       description: "Легенда CS2, огромный рус. чат",       category: "pro",           priority: 3 },
  { channel: "rekrent",      displayName: "Recrent",      description: "Топ рус. CS2 развлекательный стример", category: "entertainment", priority: 1 },
  { channel: "m0nesy",       displayName: "m0nesy",       description: "G2 CS2 игрок, рус. аудитория",         category: "pro",           priority: 3 },
  { channel: "m3wsu",        displayName: "m3wsu",        description: "Рус. CS2 стример",                     category: "entertainment", priority: 2 },
  { channel: "baz1221",      displayName: "baz1221",      description: "Рус. CS2 стример",                     category: "entertainment", priority: 2 },
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
