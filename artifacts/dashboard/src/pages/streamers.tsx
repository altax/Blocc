import { useState, useEffect, useRef, useCallback } from "react";
import {
  useGetStreamerPresets,
  useCheckStreamersOnline,
  useCollectStreamerChat,
  useGetActiveSessions,
  useStartSessionRecording,
  useStopSessionRecording,
  useGetSessionMessages,
  useGetSchedulerStatus,
  getGetActiveSessionsQueryKey,
  getGetSessionMessagesQueryKey,
  getGetSchedulerStatusQueryKey,
  type OnlineCheckItem,
  type SessionMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Radio, Download, Loader2, Zap, Square,
  MessageSquare, RefreshCw, Wifi, WifiOff,
  CircleDot, ChevronDown, ChevronUp, Activity,
  Clock, Eye, Bot,
} from "lucide-react";

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}с`;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}м`;
  const h = Math.floor(diff / 3_600_000);
  return `${h}ч ${m % 60}м`;
}

function formatDuration(start: string): string {
  const diff = Date.now() - new Date(start).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}ч ${m % 60}м`;
  return `${m}м`;
}

// ── Живой чат канала ─────────────────────────────────────────────────────────
function LiveChatFeed({ channel, compact = false }: { channel: string; compact?: boolean }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const prevCount = useRef(0);

  const { data } = useGetSessionMessages(channel, { limit: 150 }, {
    query: {
      queryKey: getGetSessionMessagesQueryKey(channel, { limit: 150 }),
      refetchInterval: 1000,
    },
  });

  const messages = data?.messages ?? [];

  useEffect(() => {
    if (autoScroll && messages.length !== prevCount.current) {
      prevCount.current = messages.length;
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages.length, autoScroll]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  };

  if (messages.length === 0) {
    return (
      <div className={cn("flex items-center justify-center text-muted-foreground text-xs gap-2", compact ? "h-12" : "h-20")}>
        <Loader2 className="w-3 h-3 animate-spin" />
        Ожидаем сообщения...
      </div>
    );
  }

  return (
    <div className={cn("relative", compact ? "h-32" : "h-52")}>
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="h-full overflow-y-auto font-mono text-xs p-2 space-y-0.5 scroll-smooth"
      >
        {messages.map((msg: SessionMessage, i: number) => (
          <div key={i} className="flex gap-1.5 leading-5 group">
            <span className="text-blue-400/80 shrink-0 min-w-0 max-w-[90px] truncate">{msg.user}</span>
            <span className="text-muted-foreground shrink-0">:</span>
            <span className="text-foreground/80 break-all">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      {!autoScroll && (
        <button
          onClick={() => {
            setAutoScroll(true);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
          }}
          className="absolute bottom-2 right-2 bg-primary/20 hover:bg-primary/30 text-primary text-[10px] px-2 py-0.5 rounded-full border border-primary/30 transition-colors"
        >
          ↓ к концу
        </button>
      )}
    </div>
  );
}

// ── Карточка стримера ─────────────────────────────────────────────────────────
function StreamerCard({
  channel,
  displayName,
  description,
  onlineInfo,
  isCollecting,
  activeSession,
  onCollect,
  onStartSession,
  onStopSession,
}: {
  channel: string;
  displayName: string;
  description: string;
  onlineInfo: OnlineCheckItem | null;
  isCollecting: boolean;
  activeSession: { message_count: number; started_at: string; game_name: string | null } | null;
  onCollect: () => void;
  onStartSession: () => void;
  onStopSession: () => void;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const isLive = onlineInfo?.is_live ?? false;
  const isCS2 = onlineInfo?.is_cs2 ?? false;
  const hasSession = !!activeSession;

  // Авто-открыть чат если сессия активна
  useEffect(() => {
    if (hasSession) setChatOpen(true);
  }, [hasSession]);

  return (
    <Card className={cn(
      "border transition-all duration-300",
      isCS2 ? "border-green-500/40 bg-green-500/5 shadow-green-500/5 shadow-lg" :
      isLive ? "border-yellow-500/30 bg-yellow-500/5" :
      "border-border/40 bg-card/30"
    )}>
      <CardContent className="p-0">
        {/* Шапка карточки */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Статус индикатор */}
          <div className="relative shrink-0">
            <div className={cn(
              "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold",
              isCS2 ? "bg-green-500/20 text-green-400" :
              isLive ? "bg-yellow-500/20 text-yellow-400" :
              "bg-muted/30 text-muted-foreground"
            )}>
              {displayName[0].toUpperCase()}
            </div>
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
              onlineInfo === null ? "bg-muted/40" :
              isCS2 ? "bg-green-500 animate-pulse" :
              isLive ? "bg-yellow-400" :
              "bg-muted-foreground/30"
            )} />
          </div>

          {/* Имя и описание */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold text-sm">{displayName}</span>
              {isCS2 && (
                <Badge className="text-[9px] h-4 px-1.5 bg-green-500/20 text-green-400 border-green-500/40 font-mono">
                  CS2 ● LIVE
                </Badge>
              )}
              {isLive && !isCS2 && onlineInfo?.game_name && (
                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-yellow-500/40 text-yellow-400">
                  {onlineInfo.game_name.slice(0, 18)}
                </Badge>
              )}
              {!isLive && onlineInfo !== null && (
                <span className="text-[10px] text-muted-foreground/50 font-mono">offline</span>
              )}
              {onlineInfo === null && (
                <span className="text-[10px] text-muted-foreground/30 font-mono">—</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">{description}</div>
          </div>

          {/* Метрики */}
          <div className="shrink-0 text-right hidden sm:block">
            {hasSession && (
              <div className="text-xs">
                <div className="text-green-400 font-mono font-medium">{activeSession!.message_count}</div>
                <div className="text-[10px] text-muted-foreground">сообщ.</div>
              </div>
            )}
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="flex items-center gap-1.5 px-4 pb-3">
          {/* Запись чата */}
          {isLive && !hasSession && (
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10 gap-1"
              onClick={onStartSession}
            >
              <Radio className="w-3 h-3" /> Запись чата
            </Button>
          )}
          {hasSession && (
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs border-red-500/40 text-red-400 hover:bg-red-500/10 gap-1"
              onClick={onStopSession}
            >
              <Square className="w-3 h-3" /> Стоп
            </Button>
          )}

          {/* Собрать паттерны */}
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs gap-1"
            onClick={onCollect}
            disabled={isCollecting}
          >
            {isCollecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {isCollecting ? "Сбор..." : "Паттерны"}
          </Button>

          {/* Развернуть чат */}
          {hasSession && (
            <button
              onClick={() => setChatOpen((v) => !v)}
              className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <MessageSquare className="w-3 h-3" />
              {chatOpen ? "Свернуть" : "Чат"}
              {chatOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
        </div>

        {/* Активная сессия — статус + чат */}
        {hasSession && (
          <div className="border-t border-green-500/20">
            <div className="flex items-center justify-between px-4 py-1.5 bg-green-500/5">
              <div className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse shrink-0" />
                <span className="text-green-400 font-medium">Запись {formatDuration(activeSession!.started_at)}</span>
                {activeSession!.game_name && (
                  <span className="text-muted-foreground">· {activeSession!.game_name}</span>
                )}
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">{activeSession!.message_count} сообщ.</span>
            </div>
            {chatOpen && (
              <div className="border-t border-green-500/10 bg-black/20">
                <LiveChatFeed channel={channel} compact />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Главная страница ─────────────────────────────────────────────────────────
export default function Streamers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [onlineResults, setOnlineResults] = useState<Map<string, OnlineCheckItem>>(new Map());
  const [checking, setChecking] = useState(false);
  const [collecting, setCollecting] = useState<Set<string>>(new Set());
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const [selectedFeedChannel, setSelectedFeedChannel] = useState<string | null>(null);

  const { data: presets } = useGetStreamerPresets();
  const checkOnline = useCheckStreamersOnline();
  const collectChat = useCollectStreamerChat();
  const startSession = useStartSessionRecording();
  const stopSession = useStopSessionRecording();

  const { data: activeSessions, refetch: refetchActive } = useGetActiveSessions({
    query: {
      queryKey: getGetActiveSessionsQueryKey(),
      refetchInterval: 3000,
    },
  });

  const { data: schedulerStatus } = useGetSchedulerStatus({
    query: {
      queryKey: getGetSchedulerStatusQueryKey(),
      refetchInterval: 15000,
    },
  });

  const activeSessionMap = new Map((activeSessions ?? []).map((s) => [s.channel, s]));

  // ── Проверка онлайна ───────────────────────────────────────────────────
  const runCheck = useCallback(async (silent = false) => {
    if (checking) return;
    setChecking(true);
    try {
      const result = await checkOnline.mutateAsync({ data: {} });
      const map = new Map<string, OnlineCheckItem>();
      for (const r of result.results) map.set(r.channel, r);
      setOnlineResults(map);
      setLastCheckedAt(new Date());
      if (!silent) {
        const liveCount = result.results.filter((r) => r.is_live).length;
        const cs2Count = result.results.filter((r) => r.is_cs2).length;
        toast({
          title: `Онлайн: ${liveCount} из ${result.results.length}`,
          description: cs2Count > 0 ? `${cs2Count} стримят CS2` : "CS2 никто не стримит",
        });
      }
    } catch {
      if (!silent) toast({ title: "Ошибка проверки", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  }, [checking, checkOnline, toast]);

  // Авто-проверка при загрузке и каждые 60 секунд
  useEffect(() => {
    runCheck(true);
    const interval = setInterval(() => runCheck(true), 60_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Сбор паттернов ─────────────────────────────────────────────────────
  const handleCollect = async (channel: string) => {
    setCollecting((prev) => new Set([...prev, channel]));
    try {
      await collectChat.mutateAsync({ channel, data: { message_count: 500 } });
      toast({ title: `Паттерны: ${channel}`, description: "Сбор запущен (~500 сообщ., 5–15 мин)" });
    } catch {
      toast({ title: "Ошибка сбора", variant: "destructive" });
    } finally {
      setTimeout(() => {
        setCollecting((prev) => { const s = new Set(prev); s.delete(channel); return s; });
      }, 8000);
    }
  };

  // ── Старт/стоп записи ──────────────────────────────────────────────────
  const handleStartSession = async (channel: string) => {
    try {
      await startSession.mutateAsync({ channel, data: {} });
      toast({ title: `Запись начата: ${channel}` });
      refetchActive();
      queryClient.invalidateQueries({ queryKey: getGetActiveSessionsQueryKey() });
    } catch {
      toast({ title: "Ошибка старта записи", variant: "destructive" });
    }
  };

  const handleStopSession = async (channel: string) => {
    try {
      await stopSession.mutateAsync({ channel });
      toast({ title: `Запись остановлена: ${channel}` });
      refetchActive();
      queryClient.invalidateQueries({ queryKey: getGetActiveSessionsQueryKey() });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const channels = presets ?? [];
  const liveChannels = channels.filter((p) => onlineResults.get(p.channel)?.is_live);
  const cs2Channels = channels.filter((p) => onlineResults.get(p.channel)?.is_cs2);
  const offlineChannels = channels.filter((p) => {
    const info = onlineResults.get(p.channel);
    return info !== undefined && !info.is_live;
  });
  const uncheckedChannels = channels.filter((p) => !onlineResults.has(p.channel));

  const activeCount = activeSessions?.length ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── Заголовок ─────────────────────────────────────────────────── */}
      <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Eye className="w-5 h-5 text-primary" />
            Стримеры
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Мониторинг · Запись чата · Сбор паттернов для обучения ИИ
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Статистика */}
          {onlineResults.size > 0 && (
            <div className="hidden sm:flex items-center gap-3 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-green-400 font-medium">{cs2Channels.length} CS2</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-yellow-400" />
                <span className="text-yellow-400">{liveChannels.length - cs2Channels.length} live</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-muted-foreground/30" />
                <span className="text-muted-foreground">{offlineChannels.length} offline</span>
              </div>
            </div>
          )}

          {/* Кнопка обновления */}
          <Button
            size="sm"
            variant="outline"
            onClick={() => runCheck(false)}
            disabled={checking}
            className="gap-1.5 h-8 text-xs"
          >
            {checking
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />}
            {checking ? "Проверяю..." : "Обновить"}
          </Button>
        </div>
      </div>

      {/* Статус последней проверки */}
      {lastCheckedAt && (
        <div className="px-6 py-1.5 bg-muted/20 border-b border-border/30 flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
          <Clock className="w-3 h-3" />
          <span>Последняя проверка: {formatAgo(lastCheckedAt.toISOString())} назад · автообновление каждые 60с</span>
          {activeCount > 0 && (
            <>
              <span className="mx-1">·</span>
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
              <span className="text-green-400">{activeCount} активных записей</span>
            </>
          )}
          {schedulerStatus?.auto_record_enabled && (
            <>
              <span className="mx-1">·</span>
              <CircleDot className="w-3 h-3 text-green-400" />
              <span className="text-green-400">Авто-запись включена</span>
            </>
          )}
        </div>
      )}

      <div className="flex-1 overflow-hidden flex">
        {/* ── Основной список ────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-4">

            {/* Активные записи — плашки вверху */}
            {activeCount > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-green-400 uppercase tracking-wider px-1">
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                  Активные записи ({activeCount})
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {(activeSessions ?? []).map((s) => {
                    const preset = channels.find((p) => p.channel === s.channel);
                    return (
                      <StreamerCard
                        key={s.channel}
                        channel={s.channel}
                        displayName={preset?.displayName ?? s.channel}
                        description={preset?.description ?? ""}
                        onlineInfo={onlineResults.get(s.channel) ?? null}
                        isCollecting={collecting.has(s.channel)}
                        activeSession={s}
                        onCollect={() => handleCollect(s.channel)}
                        onStartSession={() => handleStartSession(s.channel)}
                        onStopSession={() => handleStopSession(s.channel)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* CS2 онлайн */}
            {cs2Channels.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-green-400/80 uppercase tracking-wider px-1">
                  <Zap className="w-3 h-3" />
                  CS2 онлайн ({cs2Channels.length})
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {cs2Channels
                    .filter((p) => !activeSessionMap.has(p.channel))
                    .map((p) => (
                      <StreamerCard
                        key={p.channel}
                        channel={p.channel}
                        displayName={p.displayName}
                        description={p.description}
                        onlineInfo={onlineResults.get(p.channel) ?? null}
                        isCollecting={collecting.has(p.channel)}
                        activeSession={activeSessionMap.get(p.channel) ?? null}
                        onCollect={() => handleCollect(p.channel)}
                        onStartSession={() => handleStartSession(p.channel)}
                        onStopSession={() => handleStopSession(p.channel)}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Другие онлайн (не CS2) */}
            {liveChannels.filter((p) => !onlineResults.get(p.channel)?.is_cs2 && !activeSessionMap.has(p.channel)).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-medium text-yellow-400/80 uppercase tracking-wider px-1">
                  <Wifi className="w-3 h-3" />
                  Онлайн (не CS2)
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                  {liveChannels
                    .filter((p) => !onlineResults.get(p.channel)?.is_cs2 && !activeSessionMap.has(p.channel))
                    .map((p) => (
                      <StreamerCard
                        key={p.channel}
                        channel={p.channel}
                        displayName={p.displayName}
                        description={p.description}
                        onlineInfo={onlineResults.get(p.channel) ?? null}
                        isCollecting={collecting.has(p.channel)}
                        activeSession={null}
                        onCollect={() => handleCollect(p.channel)}
                        onStartSession={() => handleStartSession(p.channel)}
                        onStopSession={() => handleStopSession(p.channel)}
                      />
                    ))}
                </div>
              </div>
            )}

            {/* Все стримеры (оффлайн + непроверенные) */}
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider px-1">
                <WifiOff className="w-3 h-3" />
                {checking ? "Проверяем..." : offlineChannels.length > 0 ? `Оффлайн (${offlineChannels.length})` : `Все стримеры (${channels.length})`}
              </div>
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {(onlineResults.size > 0 ? offlineChannels : uncheckedChannels)
                  .filter((p) => !activeSessionMap.has(p.channel) && !cs2Channels.includes(p) && !liveChannels.includes(p))
                  .map((p) => (
                    <StreamerCard
                      key={p.channel}
                      channel={p.channel}
                      displayName={p.displayName}
                      description={p.description}
                      onlineInfo={onlineResults.get(p.channel) ?? null}
                      isCollecting={collecting.has(p.channel)}
                      activeSession={null}
                      onCollect={() => handleCollect(p.channel)}
                      onStartSession={() => handleStartSession(p.channel)}
                      onStopSession={() => handleStopSession(p.channel)}
                    />
                  ))}
              </div>
            </div>

            {/* Состояние до первой проверки */}
            {onlineResults.size === 0 && !checking && (
              <div className="text-center py-12 text-muted-foreground">
                <Activity className="w-10 h-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm">Загружаем данные стримеров...</p>
              </div>
            )}

          </div>
        </div>

        {/* ── Боковая панель: полный чат выбранного канала ─────────────── */}
        {selectedFeedChannel && (
          <div className="w-72 border-l border-border/50 flex flex-col bg-card/30 shrink-0">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="w-4 h-4 text-primary" />
                {selectedFeedChannel}
              </div>
              <button
                onClick={() => setSelectedFeedChannel(null)}
                className="text-muted-foreground hover:text-foreground text-xs"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <LiveChatFeed channel={selectedFeedChannel} />
            </div>
          </div>
        )}
      </div>

      {/* ── Нижняя строка статуса планировщика ────────────────────────── */}
      {schedulerStatus && (
        <div className="px-6 py-2 border-t border-border/30 bg-muted/10 flex items-center gap-4 text-[11px] text-muted-foreground shrink-0">
          <Bot className="w-3.5 h-3.5 shrink-0" />
          <span>Планировщик: <span className={schedulerStatus.running ? "text-green-400" : "text-muted-foreground"}>{schedulerStatus.running ? "запущен" : "остановлен"}</span></span>
          <span>·</span>
          <span>Поллинг: каждые {schedulerStatus.recording_poll_interval_minutes}м</span>
          {schedulerStatus.auto_recording_channels.length > 0 && (
            <>
              <span>·</span>
              <span>Авто-запись: <span className="text-green-400">{schedulerStatus.auto_recording_channels.join(", ")}</span></span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
