import { useState } from "react";
import { useListStreamers, useGetStreamerPresets, useDetectLiveChannels, useCollectStreamerChat, useGetStreamerAnalysis, getGetStreamerAnalysisQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Radio,
  Users,
  Download,
  BarChart3,
  FileText,
  Loader2,
  ChevronDown,
  ChevronUp,
  Globe,
  Gamepad2,
} from "lucide-react";

export default function Streamers() {
  const { toast } = useToast();
  const [detecting, setDetecting] = useState(false);
  const [liveResults, setLiveResults] = useState<Array<{ channel: string; message_count: number; is_live: boolean; messages_per_minute: number }> | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const { data: streamers, refetch: refetchStreamers } = useListStreamers();
  const { data: presets } = useGetStreamerPresets();
  const detectLive = useDetectLiveChannels();
  const collectChat = useCollectStreamerChat();

  const { data: analysis } = useGetStreamerAnalysis(
    expandedChannel ?? "",
    { query: { enabled: !!expandedChannel, queryKey: getGetStreamerAnalysisQueryKey(expandedChannel ?? "") } }
  );

  const handleDetectLive = async () => {
    setDetecting(true);
    setLiveResults(null);
    toast({ title: "Определяю кто стримит...", description: "IRC-наблюдение 30 секунд по всем каналам" });
    try {
      const result = await detectLive.mutateAsync({ data: { window_ms: 30000 } });
      setLiveResults(result.results);
      const liveChannels = result.results.filter((r) => r.is_live);
      toast({
        title: `Найдено ${liveChannels.length} активных каналов`,
        description: liveChannels.map((r) => r.channel).join(", ") || "Никто не стримит",
      });
    } catch {
      toast({ title: "Ошибка детекции", variant: "destructive" });
    } finally {
      setDetecting(false);
    }
  };

  const handleCollect = async (channel: string) => {
    setCollecting(channel);
    toast({ title: `Собираю чат ${channel}`, description: "500 сообщений + анализ. Займёт 5–15 минут." });
    try {
      await collectChat.mutateAsync({ channel, data: { message_count: 500 } });
      toast({ title: `Сбор ${channel} запущен`, description: "Данные сохранятся в файл автоматически" });
      setTimeout(() => { refetchStreamers(); setCollecting(null); }, 3000);
    } catch {
      toast({ title: "Ошибка запуска сбора", variant: "destructive" });
      setCollecting(null);
    }
  };

  const presetMap = new Map(presets?.map((p) => [p.channel, p]) ?? []);
  const fileMap = new Map(streamers?.map((s) => [s.channel, s]) ?? []);

  // Собираем полный список: пресеты + каналы с файлами
  const allChannels = [
    ...(presets ?? []),
    ...(streamers?.filter((s) => !presets?.find((p) => p.channel === s.channel)).map((s) => ({
      channel: s.channel,
      displayName: s.display_name ?? s.channel,
      description: s.description ?? "",
      category: s.category as "entertainment" | "pro" | "variety",
      priority: 99,
    })) ?? []),
  ];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-8 py-6 border-b border-border/50">
        <h1 className="text-xl font-semibold">Стримеры</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Сбор и анализ чата по каждому каналу. Данные хранятся в <code className="text-xs bg-muted px-1 rounded">data/streamers/</code>
        </p>
      </div>

      <div className="flex-1 px-8 py-6 space-y-6">

        {/* Live detector */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-500" />
              Кто стримит прямо сейчас?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Подключается к IRC всех каналов одновременно, наблюдает 30 секунд, считает активность чата.
            </p>

            <Button
              onClick={handleDetectLive}
              disabled={detecting}
              className="gap-2"
            >
              {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              {detecting ? "Наблюдаем 30 секунд..." : "Определить кто онлайн"}
            </Button>

            {liveResults && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                {liveResults.map((r) => (
                  <div
                    key={r.channel}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-4 py-3",
                      r.is_live ? "border-green-500/40 bg-green-500/5" : "border-border/30 opacity-50"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className={cn("w-2 h-2 rounded-full", r.is_live ? "bg-green-500 animate-pulse" : "bg-muted")} />
                      <div>
                        <div className="font-medium text-sm">{presetMap.get(r.channel)?.displayName ?? r.channel}</div>
                        <div className="text-xs text-muted-foreground">
                          {r.message_count} сообщ. · {r.messages_per_minute} msg/min
                        </div>
                      </div>
                    </div>
                    {r.is_live && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10"
                        onClick={() => handleCollect(r.channel)}
                        disabled={collecting === r.channel}
                      >
                        {collecting === r.channel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                        Собрать
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Streamers list */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">
            Каналы для обучения
          </h2>

          {allChannels.map((preset) => {
            const fileData = fileMap.get(preset.channel);
            const hasData = !!fileData?.has_analysis;
            const isExpanded = expandedChannel === preset.channel;

            return (
              <Card key={preset.channel} className={cn("border-border/50 transition-all", hasData && "border-primary/20")}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                        preset.category === "entertainment" ? "bg-purple-500/20 text-purple-400" :
                        preset.category === "variety" ? "bg-blue-500/20 text-blue-400" :
                        "bg-orange-500/20 text-orange-400"
                      )}>
                        {preset.displayName[0].toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-sm flex items-center gap-2">
                          {preset.displayName}
                          <Badge variant="outline" className={cn(
                            "text-xs h-4 px-1.5",
                            preset.category === "entertainment" ? "border-purple-500/40 text-purple-400" :
                            preset.category === "variety" ? "border-blue-500/40 text-blue-400" :
                            "border-orange-500/40 text-orange-400"
                          )}>
                            {preset.category}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">{preset.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {fileData && (
                        <div className="text-right mr-2 hidden sm:block">
                          <div className="text-xs font-medium">{fileData.total_messages} сообщ.</div>
                          <div className="text-xs text-muted-foreground">{fileData.pattern_count} паттернов</div>
                        </div>
                      )}

                      <div className="flex gap-1">
                        {fileData?.has_raw && <Badge variant="outline" className="text-xs h-5 px-1.5 border-green-500/30 text-green-400">raw</Badge>}
                        {fileData?.has_patterns && <Badge variant="outline" className="text-xs h-5 px-1.5 border-blue-500/30 text-blue-400">patt</Badge>}
                        {fileData?.has_analysis && <Badge variant="outline" className="text-xs h-5 px-1.5 border-yellow-500/30 text-yellow-400">analysis</Badge>}
                      </div>

                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => handleCollect(preset.channel)}
                        disabled={collecting === preset.channel}
                      >
                        {collecting === preset.channel ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                        {hasData ? "Обновить" : "Собрать"}
                      </Button>

                      {hasData && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0"
                          onClick={() => setExpandedChannel(isExpanded ? null : preset.channel)}
                        >
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Expanded analysis */}
                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-4 bg-muted/20">
                      {analysis ? (
                        <div className="space-y-4">
                          {/* Stats row */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="bg-card rounded-lg p-3 border border-border/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Globe className="w-3 h-3 text-blue-400" />
                                <span className="text-xs text-muted-foreground">Язык</span>
                              </div>
                              <div className="text-lg font-bold text-blue-400">{analysis.stats.ru_ratio}%</div>
                              <div className="text-xs text-muted-foreground">на русском</div>
                            </div>
                            <div className="bg-card rounded-lg p-3 border border-border/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Gamepad2 className="w-3 h-3 text-green-400" />
                                <span className="text-xs text-muted-foreground">CS2</span>
                              </div>
                              <div className="text-lg font-bold text-green-400">{analysis.stats.cs2_ratio}%</div>
                              <div className="text-xs text-muted-foreground">игровых фраз</div>
                            </div>
                            <div className="bg-card rounded-lg p-3 border border-border/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Users className="w-3 h-3 text-purple-400" />
                                <span className="text-xs text-muted-foreground">Сообщений</span>
                              </div>
                              <div className="text-lg font-bold text-purple-400">{analysis.stats.total_messages}</div>
                              <div className="text-xs text-muted-foreground">собрано</div>
                            </div>
                            <div className="bg-card rounded-lg p-3 border border-border/50">
                              <div className="flex items-center gap-1.5 mb-1">
                                <BarChart3 className="w-3 h-3 text-orange-400" />
                                <span className="text-xs text-muted-foreground">Ср. длина</span>
                              </div>
                              <div className="text-lg font-bold text-orange-400">{analysis.stats.avg_message_length}</div>
                              <div className="text-xs text-muted-foreground">символов</div>
                            </div>
                          </div>

                          {/* Style notes */}
                          {analysis.style_notes.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="w-3 h-3" /> Характер чата
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {analysis.style_notes.map((note, i) => (
                                  <div key={i} className="text-xs bg-muted rounded-md px-2.5 py-1 text-foreground/80">
                                    {note}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Top phrases */}
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                              Топ фразы
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {analysis.top_phrases.slice(0, 20).map((p, i) => (
                                <span
                                  key={i}
                                  className="text-xs bg-card border border-border/50 rounded px-2 py-0.5 font-mono"
                                  title={`${p.type} · ×${p.frequency}`}
                                >
                                  {p.content}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Pattern type breakdown */}
                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Типы</div>
                            <div className="flex flex-wrap gap-2">
                              {analysis.stats.top_pattern_types.map((t) => (
                                <div key={t.type} className="flex items-center gap-1.5 text-xs">
                                  <span className="text-muted-foreground">{t.type}</span>
                                  <span className="font-medium">{t.percent}%</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Loader2 className="w-4 h-4 animate-spin" /> Загружаю анализ...
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
