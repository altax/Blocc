export interface StreamerPreset {
  channel: string;
  displayName: string;
  description: string;
  priority: number;
}

export const RU_CS2_STREAMERS: StreamerPreset[] = [
  { channel: "s1mple", displayName: "s1mple", description: "Легенда CS2, огромный русский чат", priority: 1 },
  { channel: "electronic", displayName: "electronic", description: "NaVi игрок, русскоязычный чат", priority: 1 },
  { channel: "b1t_cs", displayName: "b1t_cs", description: "NaVi игрок, активный чат", priority: 1 },
  { channel: "sh1ro", displayName: "sh1ro", description: "Cloud9, популярный рус. чат", priority: 2 },
  { channel: "xsepower", displayName: "xsepower", description: "Популярный рус. CS2 стример", priority: 2 },
  { channel: "nafany", displayName: "nafany", description: "Рус. CS2, живой чат", priority: 2 },
  { channel: "buster_cs", displayName: "buster_cs", description: "Русскоязычный CS2", priority: 2 },
  { channel: "hobbit_cs", displayName: "hobbit_cs", description: "Казахский/русский CS2", priority: 3 },
  { channel: "yekindar", displayName: "YEKINDAR", description: "Популярный, частично рус. чат", priority: 3 },
  { channel: "forester_cs", displayName: "forester_cs", description: "Рус. CS2 игрок", priority: 3 },
];

export function getPresetChannels(minPriority = 3): string[] {
  return RU_CS2_STREAMERS
    .filter((s) => s.priority <= minPriority)
    .map((s) => s.channel);
}
