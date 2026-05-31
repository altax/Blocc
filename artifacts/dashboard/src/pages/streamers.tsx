import { useState } from "react";
import {
  useListStreamers, useGetStreamerPresets, useDetectLiveChannels,
  useCollectStreamerChat, useGetStreamerAnalysis, getGetStreamerAnalysisQueryKey,
  useGetSchedulerStatus, useStartScheduler, useStopScheduler, useRunSchedulerNow,
  getGetSchedulerStatusQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Radio, Users, Download, BarChart3, FileText, Loader2,
  ChevronDown, ChevronUp, Globe, Gamepad2, Clock, Play, Square, Zap,
} from "lucide-react";

function formatNextCheck(iso: string | null): string {
  if (!iso) return "—";
  const diff = new Date(iso).getTime() - Date.now();
  if (diff < 0) return "скоро";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  return h > 0 ? `через ${h}ч ${m}м` : `через ${m}м`;
}

function formatAgo(iso: string | null): string {
  if (!iso) return "никогда";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(diff / 3_600_000);
  if (h > 0) return `${h}ч назад`;
  if (m > 0) return `${m}м назад`;
  return "только что";
}

export default function Streamers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [detecting, setDetecting] = useState(false);
  const [liveResults, setLiveResults] = useState<Array<{ channel: string; message_count: number; is_live: boolean; messages_per_minute: number }> | null>(null);
  const [collecting, setCollecting] = useState<string | null>(null);
  const [expandedChannel, setExpandedChannel] = useState<string | null>(null);

  const { data: streamers, refetch: refetchStreamers } = useListStreamers();
  const { data: presets } = useGetStreamerPresets();
  const { data: scheduler, refetch: refetchScheduler } = useGetSchedulerStatus({
    query: { queryKey: getGetSchedulerStatusQueryKey(), refetchInterval: 5000 }
  });

  const detectLive = useDetectLiveChannels();
  const collectChat = useCollectStreamerChat();
  const startScheduler = useStartScheduler({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSchedulerStatusQueryKey() }) } });
  const stopScheduler = useStopScheduler({ mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetSchedulerStatusQueryKey() }) } });
  const runNow = useRunSchedulerNow();

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
        description: liveChannels.map((r) => r.channel).join(", ") || "Никто не стримит прямо сейчас",
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

  const handleRunNow = async () => {
    toast({ title: "Запускаю проверку...", description: "Детекция + авто-сбор запущены в фоне" });
    await runNow.mutateAsync();
    setTimeout(() => refetchScheduler(), 500);
  };

  const presetMap = new Map(presets?.map((p) => [p.channel, p]) ?? []);
  const fileMap = new Map(streamers?.map((s) => [s.channel, s]) ?? []);

  const allChannels = [
    ...(presets ?? []),
    ...(streamers?.filter((s) => !presets?.find((p) => p.channel === s.channel)).map((s) => ({
      channel: s.channel, displayName: s.display_name ?? s.channel, description: s.description ?? "",
      category: s.category as "entertainment" | "pro" | "variety", priority: 99,
    })) ?? []),
  ];

  const isCollecting = (channel: string) =>
    collecting === channel || (scheduler?.currently_collecting ?? []).includes(channel);

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-8 py-6 border-b border-border/50">
        <h1 className="text-xl font-semibold">Стримеры</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Сбор и анализ чата по каждому каналу · данные в <code className="text-xs bg-muted px-1 rounded">data/streamers/</code>
        </p>
      </div>

      <div className="flex-1 px-8 py-6 space-y-5">

        {/* ── Автопланировщик ────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="w-4 h-4 text-primary" />
              Автопланировщик
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-muted/40 rounded-lg px-3 py-2">
                <div className="text-xs text-muted-foreground mb-0.5">Статус</div>
                <div className="flex items-center gap-1.5">
                  <span className={cn("w-2 h-2 rounded-full", scheduler?.running ? "bg-green-500 animate-pulse" : "bg-muted-foreground")} />
                  <span className="text-sm font-medium">{scheduler?.running ? "Работает" : "Остановлен"}</span>
                </div>
              </div>
              <div className="bg-muted/40 rounded-lg px-3 py-2">
                <div className="text-xs text-muted-foreground mb-0.5">Следующая проверка</div>
                <div className="text-sm font-medium">{formatNextCheck(scheduler?.next_check_at ?? null)}</div>
              </div>
              <div className="bg-muted/40 rounded-lg px-3 py-2">
                <div className="text-xs text-muted-foreground mb-0.5">Последняя проверка</div>
                <div className="text-sm font-medium">{formatAgo(scheduler?.last_check_at ?? null)}</div>
              </div>
              <div className="bg-muted/40 rounded-lg px-3 py-2">
                <div className="text-xs text-muted-foreground mb-0.5">Авто-сборов</div>
                <div className="text-sm font-medium">{scheduler?.total_auto_collections ?? 0}</div>
              </div>
            </div>

            {/* Currently collecting */}
            {(scheduler?.currently_collecting?.length ?? 0) > 0 && (
              <div className="flex items-center gap-2 text-sm">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>Собираю: <strong>{scheduler!.currently_collecting.join(", ")}</strong></span>
              </div>
            )}

            {/* Last live */}
            {(scheduler?.last_live_channels?.length ?? 0) > 0 && (
              <div className="text-sm text-muted-foreground">
                В прошлый раз онлайн: {" "}
                {scheduler!.last_live_channels.map((ch) => (
                  <Badge key={ch} variant="outline" className="mr-1 text-green-400 border-green-500/30">{ch}</Badge>
                ))}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              {scheduler?.running ? (
                <Button size="sm" variant="outline" className="gap-1.5 border-destructive/40 text-destructive hover:bg-destructive/10"
                  onClick={() => stopScheduler.mutate()} disabled={stopScheduler.isPending}>
                  <Square className="w-3.5 h-3.5" /> Остановить
                </Button>
              ) : (
                <Button size="sm" className="gap-1.5"
                  onClick={() => startScheduler.mutate({ data: {} })} disabled={startScheduler.isPending}>
                  <Play className="w-3.5 h-3.5" /> Запустить (каждые 3ч)
                </Button>
              )}
              <Button size="sm" variant="outline" className="gap-1.5"
                onClick={handleRunNow} disabled={runNow.isPending}>
                <Zap className="w-3.5 h-3.5" /> Проверить сейчас
              </Button>
            </div>

            {/* Collection history */}
            {(scheduler?.collection_history?.length ?? 0) > 0 && (
              <div className="space-y-1.5 mt-1">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">История сборов</div>
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {[...scheduler!.collection_history].reverse().slice(0, 10).map((rec, i) => (
                    <div key={i} className="flex items-center justify-between text-xs py-1 border-b border-border/30 last:border-0">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={cn("h-4 px-1.5", rec.trigger === "auto" ? "border-primary/40 text-primary" : "border-muted-foreground/40")}>
                          {rec.trigger}
                        </Badge>
                        <span className="font-medium">{rec.channel}</span>
                      </div>
                      <div className="text-muted-foreground flex items-center gap-3">
                        {rec.patterns_saved != null && <span>{rec.patterns_saved} патт.</span>}
                        <span>{rec.finished_at ? "✓" : <Loader2 className="w-3 h-3 animate-spin inline" />}</span>
                        <span>{formatAgo(rec.started_at)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Live detector ────────────────────────────── */}
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
            <Button onClick={handleDetectLive} disabled={detecting} className="gap-2">
              {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
              {detecting ? "Наблюдаем 30 секунд..." : "Определить кто онлайн"}
            </Button>

            {liveResults && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                {liveResults.map((r) => (
                  <div key={r.channel} className={cn(
                    "flex items-center justify-between rounded-lg border px-4 py-3",
                    r.is_live ? "border-green-500/40 bg-green-500/5" : "border-border/30 opacity-50"
                  )}>
                    <div className="flex items-center gap-3">
                      <span className={cn("w-2 h-2 rounded-full", r.is_live ? "bg-green-500 animate-pulse" : "bg-muted")} />
                      <div>
                        <div className="font-medium text-sm">{presetMap.get(r.channel)?.displayName ?? r.channel}</div>
                        <div className="text-xs text-muted-foreground">{r.message_count} сообщ. · {r.messages_per_minute} msg/min</div>
                      </div>
                    </div>
                    {r.is_live && (
                      <Button size="sm" variant="outline" className="h-7 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10"
                        onClick={() => handleCollect(r.channel)} disabled={isCollecting(r.channel)}>
                        {isCollecting(r.channel) ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                        Собрать
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Channels list ────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Каналы для обучения</h2>

          {allChannels.map((preset) => {
            const fileData = fileMap.get(preset.channel);
            const hasData = !!fileData?.has_analysis;
            const isExpanded = expandedChannel === preset.channel;
            const busy = isCollecting(preset.channel);

            return (
              <Card key={preset.channel} className={cn("border-border/50 transition-all", hasData && "border-primary/20")}>
                <CardContent className="p-0">
                  <div className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        preset.category === "entertainment" ? "bg-purple-500/20 text-purple-400" :
                        preset.category === "variety" ? "bg-blue-500/20 text-blue-400" :
                        "bg-orange-500/20 text-orange-400"
                      )}>
                        {(preset.displayName ?? preset.channel)[0].toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
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
                        <div className="text-xs text-muted-foreground truncate">{preset.description}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {fileData && (
                        <div className="text-right mr-2 hidden sm:block">
                          <div className="text-xs font-medium">{fileData.total_messages} сообщ.</div>
                          <div className="text-xs text-muted-foreground">{fileData.pattern_count} патт.</div>
                        </div>
                      )}
                      <div className="flex gap-1">
                        {fileData?.has_raw && <Badge variant="outline" className="text-xs h-5 px-1.5 border-green-500/30 text-green-400">raw</Badge>}
                        {fileData?.has_patterns && <Badge variant="outline" className="text-xs h-5 px-1.5 border-blue-500/30 text-blue-400">patt</Badge>}
                        {fileData?.has_analysis && <Badge variant="outline" className="text-xs h-5 px-1.5 border-yellow-500/30 text-yellow-400">analysis</Badge>}
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => handleCollect(preset.channel)} disabled={busy}>
                        {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                        {hasData ? "Обновить" : "Собрать"}
                      </Button>
                      {hasData && (
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                          onClick={() => setExpandedChannel(isExpanded ? null : preset.channel)}>
                          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </Button>
                      )}
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/50 px-4 py-4 bg-muted/20">
                      {analysis ? (
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {[
                              { icon: Globe, color: "text-blue-400", value: `${analysis.stats.ru_ratio}%`, label: "на русском" },
                              { icon: Gamepad2, color: "text-green-400", value: `${analysis.stats.cs2_ratio}%`, label: "игровых фраз" },
                              { icon: Users, color: "text-purple-400", value: analysis.stats.total_messages, label: "собрано" },
                              { icon: BarChart3, color: "text-orange-400", value: analysis.stats.avg_message_length, label: "символов ср." },
                            ].map(({ icon: Icon, color, value, label }) => (
                              <div key={label} className="bg-card rounded-lg p-3 border border-border/50">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <Icon className={cn("w-3 h-3", color)} />
                                  <span className="text-xs text-muted-foreground">{label}</span>
                                </div>
                                <div className={cn("text-lg font-bold", color)}>{value}</div>
                              </div>
                            ))}
                          </div>

                          {analysis.style_notes.length > 0 && (
                            <div className="space-y-1.5">
                              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                                <FileText className="w-3 h-3" /> Характер чата
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {analysis.style_notes.map((note, i) => (
                                  <div key={i} className="text-xs bg-muted rounded-md px-2.5 py-1">{note}</div>
                                ))}
                              </div>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Топ фразы</div>
                            <div className="flex flex-wrap gap-1.5">
                              {analysis.top_phrases.slice(0, 20).map((p, i) => (
                                <span key={i} className="text-xs bg-card border border-border/50 rounded px-2 py-0.5 font-mono" title={`${p.type} ×${p.frequency}`}>
                                  {p.content}
                                </span>
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
