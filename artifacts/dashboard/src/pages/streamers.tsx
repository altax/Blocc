import { useState, useEffect, useRef } from "react";
import {
  useGetStreamerPresets,
  useCheckStreamersOnline,
  useDetectLiveChannels,
  useCollectStreamerChat,
  useListSessions,
  useGetActiveSessions,
  useStartSessionRecording,
  useStopSessionRecording,
  useGetSessionMessages,
  getGetActiveSessionsQueryKey,
  getListSessionsQueryKey,
  getGetSessionMessagesQueryKey,
  type OnlineCheckItem,
  type SessionSummary,
  type SessionMessage,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  Radio, Download, Loader2, Play, Square, Zap,
  MessageSquare, Clock, Eye, ChevronDown, ChevronUp, Wifi, WifiOff,
} from "lucide-react";

function formatAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}с назад`;
  const m = Math.floor(diff / 60_000);
  if (m < 60) return `${m}м назад`;
  const h = Math.floor(diff / 3_600_000);
  return `${h}ч назад`;
}

function formatDuration(start: string, end: string | null | undefined): string {
  const endTime = end ? new Date(end).getTime() : Date.now();
  const diff = endTime - new Date(start).getTime();
  const m = Math.floor(diff / 60_000);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}ч ${m % 60}м`;
  return `${m}м`;
}

// ── Панель сообщений сессии ─────────────────────────────────────────────────
function SessionMessageFeed({ channel, total }: { channel: string; total: number }) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const { data } = useGetSessionMessages(channel, { limit: 200 }, {
    query: {
      queryKey: getGetSessionMessagesQueryKey(channel, { limit: 200 }),
      refetchInterval: 3000,
    }
  });

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages, autoScroll]);

  const messages = data?.messages ?? [];

  return (
    <div className="flex flex-col h-64">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/40 bg-muted/20">
        <span className="text-xs text-muted-foreground">
          {total} сообщений · показано {messages.length}
        </span>
        <button
          onClick={() => setAutoScroll((v) => !v)}
          className={cn("text-xs px-2 py-0.5 rounded", autoScroll ? "text-primary" : "text-muted-foreground")}
        >
          {autoScroll ? "▼ авто" : "▼ пауза"}
        </button>
      </div>
      <div className="flex-1 overflow-y-auto font-mono text-xs p-2 space-y-0.5">
        {messages.length === 0 && (
          <div className="text-muted-foreground text-center py-8">Ждём сообщения...</div>
        )}
        {messages.map((msg: SessionMessage, i: number) => (
          <div key={i} className="flex gap-2 leading-5">
            <span className="text-blue-400 shrink-0">{msg.user}:</span>
            <span className="text-foreground/90 break-all">{msg.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}

// ── Карточка активной сессии ────────────────────────────────────────────────
function ActiveSessionCard({
  session,
  presetMap,
  onStop,
}: {
  session: SessionSummary;
  presetMap: Map<string, { displayName: string }>;
  onStop: (channel: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const displayName = presetMap.get(session.channel)?.displayName ?? session.channel;

  return (
    <Card className="border-green-500/30 bg-green-500/5">
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0" />
            <div>
              <div className="font-medium text-sm flex items-center gap-2">
                {displayName}
                {session.game_name && (
                  <Badge variant="outline" className="text-xs h-4 px-1.5 border-green-500/40 text-green-400">
                    {session.game_name}
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                Запись {formatDuration(session.started_at, null)} ·{" "}
                <span className="text-green-400 font-medium">{session.message_count} сообщ.</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm" variant="ghost"
              className="h-7 w-7 p-0"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </Button>
            <Button
              size="sm" variant="outline"
              className="h-7 text-xs border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={() => onStop(session.channel)}
            >
              <Square className="w-3 h-3 mr-1" /> Стоп
            </Button>
          </div>
        </div>
        {expanded && (
          <div className="border-t border-border/40">
            <SessionMessageFeed channel={session.channel} total={session.message_count} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Строка стримера ─────────────────────────────────────────────────────────
function StreamerRow({
  channel,
  displayName,
  category,
  description,
  onlineInfo,
  isCollecting,
  hasSession,
  onCollect,
  onStartSession,
}: {
  channel: string;
  displayName: string;
  category: string;
  description: string;
  onlineInfo: OnlineCheckItem | null;
  isCollecting: boolean;
  hasSession: boolean;
  onCollect: () => void;
  onStartSession: () => void;
}) {
  const isLive = onlineInfo?.is_live ?? false;
  const isCS2 = onlineInfo?.is_cs2 ?? false;

  return (
    <div className={cn(
      "flex items-center justify-between px-4 py-3 rounded-lg border transition-all",
      isCS2 ? "border-green-500/30 bg-green-500/5" :
      isLive ? "border-yellow-500/20 bg-yellow-500/5" :
      "border-border/30 bg-card/30"
    )}>
      <div className="flex items-center gap-3 min-w-0">
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
          category === "entertainment" ? "bg-purple-500/20 text-purple-400" :
          category === "variety" ? "bg-blue-500/20 text-blue-400" :
          "bg-orange-500/20 text-orange-400"
        )}>
          {displayName[0].toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="font-medium text-sm flex items-center gap-2 flex-wrap">
            {displayName}
            {isCS2 && (
              <Badge variant="outline" className="text-xs h-4 px-1.5 border-green-500/40 text-green-400">CS2 ✓</Badge>
            )}
            {isLive && !isCS2 && onlineInfo?.game_name && (
              <Badge variant="outline" className="text-xs h-4 px-1.5 border-yellow-500/40 text-yellow-400">
                {onlineInfo.game_name.length > 16 ? onlineInfo.game_name.slice(0, 14) + "…" : onlineInfo.game_name}
              </Badge>
            )}
            {hasSession && (
              <Badge variant="outline" className="text-xs h-4 px-1.5 border-green-500/30 text-green-400 animate-pulse">
                ● REC
              </Badge>
            )}
          </div>
          <div className="text-xs text-muted-foreground truncate">{description}</div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 shrink-0 ml-2">
        {/* Статус онлайна */}
        {onlineInfo !== null && (
          isLive
            ? <Wifi className="w-3.5 h-3.5 text-green-400" />
            : <WifiOff className="w-3.5 h-3.5 text-muted-foreground/40" />
        )}

        {/* Запись сессии */}
        {isLive && !hasSession && (
          <Button
            size="sm" variant="outline"
            className="h-7 text-xs border-green-500/40 text-green-400 hover:bg-green-500/10"
            onClick={onStartSession}
          >
            <Radio className="w-3 h-3 mr-1" /> Запись
          </Button>
        )}

        {/* Сбор паттернов */}
        <Button
          size="sm" variant="outline"
          className="h-7 text-xs"
          onClick={onCollect}
          disabled={isCollecting}
        >
          {isCollecting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
          {isCollecting ? "..." : "Паттерны"}
        </Button>
      </div>
    </div>
  );
}

// ── Главная страница ─────────────────────────────────────────────────────────
export default function Streamers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [onlineResults, setOnlineResults] = useState<Map<string, OnlineCheckItem>>(new Map());
  const [checking, setChecking] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [collecting, setCollecting] = useState<Set<string>>(new Set());
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [savedExpanded, setSavedExpanded] = useState(false);

  const { data: presets } = useGetStreamerPresets();
  const checkOnline = useCheckStreamersOnline();
  const detectLive = useDetectLiveChannels();
  const collectChat = useCollectStreamerChat();
  const startSession = useStartSessionRecording();
  const stopSession = useStopSessionRecording();

  const { data: activeSessions, refetch: refetchActive } = useGetActiveSessions({
    query: {
      queryKey: getGetActiveSessionsQueryKey(),
      refetchInterval: 5000,
    }
  });

  const { data: savedSessions, refetch: refetchSaved } = useListSessions(undefined, {
    query: {
      queryKey: getListSessionsQueryKey(),
      refetchInterval: 30000,
    }
  });

  // Сессия для просмотра сообщений
  const { data: sessionMsgs } = useGetSessionMessages(
    selectedSession ?? "",
    { limit: 500 },
    {
      query: {
        enabled: !!selectedSession,
        queryKey: getGetSessionMessagesQueryKey(selectedSession ?? "", { limit: 500 }),
        refetchInterval: selectedSession ? 3000 : false,
      }
    }
  );

  const presetMap = new Map(presets?.map((p) => [p.channel, p]) ?? []);
  const activeSessionMap = new Map((activeSessions ?? []).map((s) => [s.channel, s]));

  // ── Быстрая проверка GQL (~2с) ──────────────────────────────────────────
  const handleCheckOnline = async () => {
    setChecking(true);
    try {
      const result = await checkOnline.mutateAsync({ data: {} });
      const map = new Map<string, OnlineCheckItem>();
      for (const r of result.results) map.set(r.channel, r);
      setOnlineResults(map);
      const liveCount = result.results.filter((r) => r.is_live).length;
      const cs2Count = result.results.filter((r) => r.is_cs2).length;
      toast({
        title: `Онлайн: ${liveCount} стримеров`,
        description: cs2Count > 0 ? `${cs2Count} играют в CS2` : "Никто не стримит CS2 прямо сейчас",
      });
    } catch {
      toast({ title: "Ошибка проверки", variant: "destructive" });
    } finally {
      setChecking(false);
    }
  };

  // ── Глубокая проверка IRC + GQL (30с) ──────────────────────────────────
  const handleDetectDeep = async () => {
    setDetecting(true);
    toast({ title: "Глубокий анализ...", description: "IRC 30 секунд по всем каналам" });
    try {
      const result = await detectLive.mutateAsync({ data: { window_ms: 30000 } });
      const map = new Map<string, OnlineCheckItem>();
      for (const r of result.results) {
        map.set(r.channel, {
          channel: r.channel,
          is_live: r.is_live,
          game_name: r.game_name ?? null,
          is_cs2: r.is_cs2,
        });
      }
      setOnlineResults(map);
      toast({ title: "Анализ завершён", description: `Живые: ${result.results.filter((r) => r.is_live).map((r) => r.channel).join(", ") || "никого"}` });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    } finally {
      setDetecting(false);
    }
  };

  // ── Сбор паттернов ─────────────────────────────────────────────────────
  const handleCollect = async (channel: string) => {
    setCollecting((prev) => new Set([...prev, channel]));
    toast({ title: `Собираю паттерны: ${channel}`, description: "500 сообщений, займёт 5–15 мин" });
    try {
      await collectChat.mutateAsync({ channel, data: { message_count: 500 } });
      toast({ title: `${channel}: сбор запущен` });
    } catch {
      toast({ title: "Ошибка сбора", variant: "destructive" });
    } finally {
      setTimeout(() => {
        setCollecting((prev) => { const s = new Set(prev); s.delete(channel); return s; });
      }, 5000);
    }
  };

  // ── Запуск записи сессии ───────────────────────────────────────────────
  const handleStartSession = async (channel: string) => {
    try {
      await startSession.mutateAsync({ channel, data: {} });
      toast({
        title: `Запись начата: ${channel}`,
        description: "Все сообщения пишутся в реальном времени. Автостоп при уходе офлайн.",
      });
      refetchActive();
      queryClient.invalidateQueries({ queryKey: getGetActiveSessionsQueryKey() });
    } catch {
      toast({ title: "Ошибка старта записи", variant: "destructive" });
    }
  };

  // ── Стоп записи ────────────────────────────────────────────────────────
  const handleStopSession = async (channel: string) => {
    try {
      await stopSession.mutateAsync({ channel });
      toast({ title: `Запись остановлена: ${channel}` });
      refetchActive();
      refetchSaved();
      queryClient.invalidateQueries({ queryKey: getGetActiveSessionsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getListSessionsQueryKey() });
    } catch {
      toast({ title: "Ошибка", variant: "destructive" });
    }
  };

  const channels = presets ?? [];

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-8 py-5 border-b border-border/50">
        <h1 className="text-xl font-semibold">Стримеры</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          Проверка онлайна · Запись чата в реальном времени · Сбор паттернов
        </p>
      </div>

      <div className="flex-1 px-8 py-5 space-y-5">

        {/* ── Панель проверки онлайна ─────────────────────────────────── */}
        <Card className="border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Wifi className="w-4 h-4 text-green-400" />
              Кто онлайн сейчас?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={handleCheckOnline}
                disabled={checking || detecting}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                {checking
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Zap className="w-4 h-4" />}
                {checking ? "Проверяю (~2с)..." : "Быстрая проверка GQL (~2с)"}
              </Button>
              <Button
                onClick={handleDetectDeep}
                disabled={checking || detecting}
                variant="outline"
                className="gap-2"
              >
                {detecting
                  ? <Loader2 className="w-4 h-4 animate-spin" />
                  : <Radio className="w-4 h-4" />}
                {detecting ? "IRC 30с..." : "Глубокий IRC анализ (30с)"}
              </Button>
            </div>

            {onlineResults.size > 0 && (
              <div className="text-xs text-muted-foreground">
                Проверено {onlineResults.size} каналов ·{" "}
                <span className="text-green-400">
                  {[...onlineResults.values()].filter((r) => r.is_live).length} онлайн
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Список стримеров ────────────────────────────────────────── */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-muted-foreground uppercase tracking-wider px-1">
            Все стримеры ({channels.length})
          </div>
          {channels.map((p) => (
            <StreamerRow
              key={p.channel}
              channel={p.channel}
              displayName={p.displayName}
              category={p.category}
              description={p.description}
              onlineInfo={onlineResults.get(p.channel) ?? null}
              isCollecting={collecting.has(p.channel)}
              hasSession={activeSessionMap.has(p.channel)}
              onCollect={() => handleCollect(p.channel)}
              onStartSession={() => handleStartSession(p.channel)}
            />
          ))}
        </div>

        {/* ── Активные записи ─────────────────────────────────────────── */}
        {(activeSessions?.length ?? 0) > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium uppercase tracking-wider px-1 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              Активные записи ({activeSessions!.length})
            </div>
            {activeSessions!.map((s) => (
              <ActiveSessionCard
                key={s.channel}
                session={s}
                presetMap={presetMap as Map<string, { displayName: string }>}
                onStop={handleStopSession}
              />
            ))}
          </div>
        )}

        {/* ── Сохранённые сессии ──────────────────────────────────────── */}
        {(savedSessions?.length ?? 0) > 0 && (
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Сохранённые сессии ({savedSessions!.length})
                </div>
                <Button
                  size="sm" variant="ghost" className="h-7 w-7 p-0"
                  onClick={() => setSavedExpanded((v) => !v)}
                >
                  {savedExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </Button>
              </CardTitle>
            </CardHeader>
            {savedExpanded && (
              <CardContent className="space-y-2 pt-0">
                {savedSessions!.slice(0, 20).map((s) => (
                  <div
                    key={s.file ?? s.started_at}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-lg border cursor-pointer transition-colors",
                      selectedSession === s.channel
                        ? "border-primary/40 bg-primary/5"
                        : "border-border/30 hover:border-border/60"
                    )}
                    onClick={() => setSelectedSession(selectedSession === s.channel ? null : s.channel)}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "w-1.5 h-1.5 rounded-full",
                        s.status === "recording" ? "bg-green-500 animate-pulse" :
                        s.status === "finished" ? "bg-muted-foreground" : "bg-destructive"
                      )} />
                      <div>
                        <div className="text-sm font-medium flex items-center gap-2">
                          {presetMap.get(s.channel)?.displayName ?? s.channel}
                          {s.game_name && (
                            <span className="text-xs text-muted-foreground">{s.game_name}</span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatAgo(s.started_at)} · {formatDuration(s.started_at, s.finished_at)} ·{" "}
                          {s.stop_reason && <span className="text-muted-foreground/60">{s.stop_reason}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-green-400">{s.message_count}</span>
                      <span className="text-xs text-muted-foreground">сообщ.</span>
                      <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                  </div>
                ))}

                {/* Просмотр сообщений выбранной сессии */}
                {selectedSession && sessionMsgs && (
                  <div className="mt-3 border border-border/40 rounded-lg overflow-hidden">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/20">
                      <span className="text-sm font-medium flex items-center gap-2">
                        <MessageSquare className="w-3.5 h-3.5" />
                        {presetMap.get(selectedSession)?.displayName ?? selectedSession}
                        <Badge variant="outline" className="text-xs">
                          {sessionMsgs.status}
                        </Badge>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {sessionMsgs.total} сообщений · показано {sessionMsgs.messages.length}
                      </span>
                    </div>
                    <div className="h-72 overflow-y-auto font-mono text-xs p-2 space-y-0.5 bg-card/50">
                      {sessionMsgs.messages.map((msg: SessionMessage, i: number) => (
                        <div key={i} className="flex gap-2 leading-5">
                          <span className="text-blue-400 shrink-0 font-medium">{msg.user}:</span>
                          <span className="text-foreground/90 break-all">{msg.text}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </CardContent>
            )}
          </Card>
        )}

        {/* ── Инфо о полной истории ────────────────────────────────────── */}
        <Card className="border-border/30 bg-muted/10">
          <CardContent className="px-5 py-4">
            <div className="text-sm font-medium mb-2 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-muted-foreground" />
              О полной истории чата стримера
            </div>
            <div className="text-xs text-muted-foreground space-y-1.5 leading-relaxed">
              <p>
                <strong className="text-foreground">Записывать с начала стрима</strong> — невозможно технически: Twitch не хранит IRC-историю до момента подключения. Чат существует только в реальном времени.
              </p>
              <p>
                <strong className="text-foreground">Решение:</strong> нажмите <strong>«Запись»</strong> рядом со стримером, который уже онлайн — и система запишет <em>все</em> сообщения с момента нажатия до конца стрима. Автостоп при уходе в офлайн.
              </p>
              <p>
                <strong className="text-foreground">«Сбор паттернов»</strong> — другой режим: собирает N сообщений и сразу анализирует/классифицирует для обучения бота.
              </p>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
