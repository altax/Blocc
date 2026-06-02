import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  BrainCircuit, Sparkles, TrendingUp, Database, Radio, RefreshCw,
  ChevronRight, Trash2, FileText, AlertTriangle, Users, Layers
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

// ─── Types ────────────────────────────────────────────────────────────────

type LearningEventType = "msg_classified" | "pattern_new" | "pattern_updated" | "batch_flushed";

interface LearningEvent {
  id: string;
  ts: string;
  channel: string;
  type: LearningEventType;
  msg?: { user: string; text: string };
  classification?: { pattern_type: string; lang: string; game: string };
  pattern?: { content: string; pattern_type: string; frequency: number; is_new: boolean };
  batch_stats?: { processed: number; saved: number };
}

interface LearningStats {
  total_processed: number;
  total_new_patterns: number;
  total_updated_patterns: number;
  total_batches_flushed: number;
  active_channels: string[];
  per_channel: Record<string, { processed: number; new_patterns: number; updated: number }>;
}

interface AccumulatorEntry {
  channel: string;
  pending: number;
  top5: Array<{ content: string; count: number; type: string }>;
}

interface FeedResponse {
  events: LearningEvent[];
  stats: LearningStats;
  accumulator: AccumulatorEntry[];
  server_time: string;
}

interface CorpusStats {
  file: string;
  total_messages: number;
  size_bytes: number;
  exists: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  cs2_callout: "callout",
  cs2_reaction: "реакция",
  cs2_result: "результат",
  russian_slang: "слэнг",
  hype: "hype",
  joke: "шутка",
  question: "вопрос",
  emote_combo: "эмоут",
  reaction: "реакция",
  game_specific: "игровой",
};

const TYPE_COLORS: Record<string, string> = {
  cs2_callout: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  cs2_reaction: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  cs2_result: "bg-green-500/15 text-green-400 border-green-500/30",
  russian_slang: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  hype: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  joke: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  question: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  emote_combo: "bg-amber-500/15 text-amber-400 border-amber-500/30",
  reaction: "bg-teal-500/15 text-teal-400 border-teal-500/30",
  game_specific: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const LANG_COLORS: Record<string, string> = {
  ru: "bg-red-500/10 text-red-400",
  en: "bg-sky-500/10 text-sky-400",
  mixed: "bg-amber-500/10 text-amber-400",
};

// ─── Helpers ──────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return "сейчас";
  if (diff < 60000) return `${Math.floor(diff / 1000)}с`;
  return `${Math.floor(diff / 60000)}м`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border",
      TYPE_COLORS[type] ?? "bg-slate-500/15 text-slate-400 border-slate-500/30"
    )}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function LangBadge({ lang }: { lang: string }) {
  return (
    <span className={cn(
      "inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium",
      LANG_COLORS[lang] ?? "bg-slate-500/10 text-slate-400"
    )}>
      {lang.toUpperCase()}
    </span>
  );
}

// ─── Message Stream ────────────────────────────────────────────────────────

function MessageStream({ events }: { events: LearningEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const msgs = events
    .filter((e) => e.type === "msg_classified" && e.msg)
    .slice(-100);

  useEffect(() => {
    if (autoScroll && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [msgs.length, autoScroll]);

  const onScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 48);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-card/20 shrink-0">
        <div className="flex items-center gap-1.5">
          <Radio className="w-3.5 h-3.5 text-green-400" />
          <span className="text-xs font-medium">Входящий IRC</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-[10px] text-green-400">live</span>
        </div>
      </div>
      <div ref={ref} onScroll={onScroll} className="flex-1 overflow-y-auto p-2 space-y-0.5 font-mono text-xs min-h-0">
        {msgs.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-xs leading-relaxed">
            Нет IRC сессий<br />
            <span className="text-[11px]">Запусти запись на вкладке Стримеры</span>
          </div>
        )}
        {msgs.map((e) => (
          <div key={e.id} className="flex gap-1.5 items-start group hover:bg-accent/20 rounded px-1 py-0.5 transition-colors">
            <span className="text-muted-foreground/40 shrink-0 tabular-nums text-[10px] mt-0.5">
              {new Date(e.ts).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span className="text-primary/70 shrink-0 font-semibold max-w-[80px] truncate text-[11px]">
              {e.msg!.user}
            </span>
            <span className="text-foreground/85 flex-1 break-all leading-relaxed text-[11px]">
              {e.msg!.text}
            </span>
            {e.classification && (
              <div className="flex gap-0.5 shrink-0 items-start mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <TypeBadge type={e.classification.pattern_type} />
                <LangBadge lang={e.classification.lang} />
              </div>
            )}
          </div>
        ))}
      </div>
      {!autoScroll && (
        <button
          className="mx-2 mb-1 text-xs text-muted-foreground hover:text-foreground py-1 border border-border/50 rounded flex items-center justify-center gap-1 shrink-0"
          onClick={() => { setAutoScroll(true); if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }}
        >
          <RefreshCw className="w-3 h-3" /> вниз
        </button>
      )}
    </div>
  );
}

// ─── Learning Feed ─────────────────────────────────────────────────────────

function LearningFeed({ events }: { events: LearningEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const relevant = events.filter((e) => e.type !== "msg_classified").slice(-60);

  useEffect(() => {
    if (autoScroll && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [relevant.length, autoScroll]);

  const onScroll = useCallback(() => {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    setAutoScroll(scrollHeight - scrollTop - clientHeight < 48);
  }, []);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-card/20 shrink-0">
        <div className="flex items-center gap-1.5">
          <BrainCircuit className="w-3.5 h-3.5 text-primary" />
          <span className="text-xs font-medium">Паттерны</span>
        </div>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">{relevant.length}</Badge>
      </div>
      <div ref={ref} onScroll={onScroll} className="flex-1 overflow-y-auto p-2 space-y-1 min-h-0">
        {relevant.length === 0 && (
          <div className="text-center text-muted-foreground py-8 text-xs">Паттерны появятся после старта сессии</div>
        )}
        {relevant.map((e) => (
          <div key={e.id} className={cn(
            "rounded px-2.5 py-1.5 border text-xs",
            e.type === "pattern_new" ? "bg-green-500/5 border-green-500/20" :
            e.type === "pattern_updated" ? "bg-blue-500/5 border-blue-500/20" :
            "bg-muted/20 border-border/40"
          )}>
            {e.type === "pattern_new" && e.pattern && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-green-400 shrink-0" />
                  <span className="text-green-400 font-medium text-[11px]">Новый</span>
                  <TypeBadge type={e.pattern.pattern_type} />
                  <span className="text-muted-foreground ml-auto text-[10px]">{e.channel}</span>
                </div>
                <div className="text-foreground/80 font-mono break-all pl-4 text-[11px]">"{e.pattern.content}"</div>
              </div>
            )}
            {e.type === "pattern_updated" && e.pattern && (
              <div className="space-y-0.5">
                <div className="flex items-center gap-1">
                  <TrendingUp className="w-3 h-3 text-blue-400 shrink-0" />
                  <span className="text-blue-400 font-medium text-[11px]">×{e.pattern.frequency}</span>
                  <TypeBadge type={e.pattern.pattern_type} />
                  <span className="text-muted-foreground ml-auto text-[10px]">{e.channel}</span>
                </div>
                <div className="text-foreground/60 font-mono truncate pl-4 text-[11px]">"{e.pattern.content}"</div>
              </div>
            )}
            {e.type === "batch_flushed" && e.batch_stats && (
              <div className="flex items-center gap-1.5">
                <Database className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-amber-400 font-medium text-[11px]">Flush {e.batch_stats.saved}→БД</span>
                <span className="text-muted-foreground text-[11px]">{e.channel}</span>
                <span className="text-muted-foreground ml-auto text-[10px]">{timeAgo(e.ts)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats Side Panel ─────────────────────────────────────────────────────

function StatsPanel({
  stats, accumulator, onReset, isResetting,
}: {
  stats: LearningStats | null;
  accumulator: AccumulatorEntry[];
  onReset: () => void;
  isResetting: boolean;
}) {
  const [confirmReset, setConfirmReset] = useState(false);

  const { data: corpusStats } = useQuery<CorpusStats>({
    queryKey: ["corpus-stats"],
    queryFn: async () => {
      const r = await fetch("/api/corpus/stats");
      if (!r.ok) throw new Error("failed");
      return r.json();
    },
    refetchInterval: 3000,
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 shrink-0">
        <Database className="w-3.5 h-3.5 text-amber-400" />
        <span className="text-xs font-medium">Статистика</span>
      </div>
      <div className="p-3 space-y-3 overflow-y-auto">

        {/* Corpus */}
        <div className={cn(
          "rounded-lg border p-3 space-y-2",
          corpusStats?.exists ? "bg-green-500/5 border-green-500/20" : "bg-muted/20 border-border/50"
        )}>
          <div className="flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-green-400 shrink-0" />
            <span className="text-xs font-semibold">Корпус</span>
            <span className={cn(
              "ml-auto text-[10px] px-1.5 py-0.5 rounded",
              corpusStats?.exists ? "bg-green-500/15 text-green-400" : "bg-muted/50 text-muted-foreground"
            )}>
              {corpusStats?.exists ? "активен" : "пуст"}
            </span>
          </div>
          {corpusStats?.exists && (
            <div className="flex gap-2">
              <div className="flex-1 bg-background/40 rounded p-2 text-center">
                <div className="text-base font-bold text-green-400 tabular-nums">{corpusStats.total_messages.toLocaleString()}</div>
                <div className="text-[10px] text-muted-foreground">сообщ.</div>
              </div>
              <div className="flex-1 bg-background/40 rounded p-2 text-center">
                <div className="text-base font-bold tabular-nums">{formatBytes(corpusStats.size_bytes)}</div>
                <div className="text-[10px] text-muted-foreground">размер</div>
              </div>
            </div>
          )}
        </div>

        {/* Counters */}
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: "Сообщ.", value: stats?.total_processed ?? 0, color: "text-foreground" },
            { label: "Паттернов", value: stats?.total_new_patterns ?? 0, color: "text-green-400" },
            { label: "Обновлено", value: stats?.total_updated_patterns ?? 0, color: "text-blue-400" },
            { label: "Flush", value: stats?.total_batches_flushed ?? 0, color: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-card/50 rounded border border-border/50 p-2">
              <div className={cn("text-lg font-bold tabular-nums", s.color)}>{s.value.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Accumulator */}
        {accumulator.length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">В памяти</div>
            {accumulator.map((acc) => (
              <div key={acc.channel} className="bg-card/50 rounded border border-border/50">
                <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/40">
                  <span className="text-xs font-semibold truncate">{acc.channel}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-1">{acc.pending} уник.</span>
                </div>
                <div className="p-1.5 space-y-0.5">
                  {acc.top5.map((p, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-[11px]">
                      <span className="text-muted-foreground w-4 text-right shrink-0">{p.count}×</span>
                      <span className="font-mono flex-1 truncate text-foreground/70">"{p.content}"</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Per-channel */}
        {stats && Object.keys(stats.per_channel).length > 0 && (
          <div className="space-y-1.5">
            <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">По каналам</div>
            {Object.entries(stats.per_channel).map(([ch, s]) => (
              <div key={ch} className="flex items-center gap-1.5 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                <span className="font-medium truncate flex-1">{ch}</span>
                <span className="text-muted-foreground text-[11px]">{s.processed}</span>
                <span className="text-green-400 text-[11px]">+{s.new_patterns}</span>
              </div>
            ))}
          </div>
        )}

        {/* Pipeline */}
        <div className="rounded border border-border/40 bg-card/20 p-2.5 space-y-1.5">
          <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Пайплайн</div>
          {["IRC → messages.jsonl (каждое сообщение)", "Классификатор: CS2/слэнг/реакция/язык", "Аккумулятор → flush каждые 100 сообщ.", "Топ-250 паттернов (ru·cs2 приоритет) → PG", "Бот inject 30% паттернов в системный промпт"].map((t, i) => (
            <div key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-primary/50 shrink-0 font-mono">→</span>
              <span>{t}</span>
            </div>
          ))}
        </div>

        {/* Reset */}
        <div className="rounded border border-destructive/20 bg-destructive/5 p-2.5 space-y-2">
          <div className="flex items-center gap-1.5">
            <Trash2 className="w-3 h-3 text-destructive" />
            <span className="text-xs font-semibold text-destructive">Сброс обучения</span>
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Удалит паттерны из БД. Корпус будет архивирован, не удалён.
          </p>
          {!confirmReset ? (
            <Button variant="outline" size="sm" className="w-full text-xs border-destructive/30 text-destructive hover:bg-destructive/10 h-7"
              onClick={() => setConfirmReset(true)}>
              <Trash2 className="w-3 h-3 mr-1.5" /> Сбросить
            </Button>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center gap-1 text-[11px] text-destructive">
                <AlertTriangle className="w-3 h-3" /> Точно? Необратимо.
              </div>
              <div className="flex gap-1.5">
                <Button variant="destructive" size="sm" className="flex-1 text-xs h-7"
                  onClick={() => { onReset(); setConfirmReset(false); }} disabled={isResetting}>
                  {isResetting ? "..." : "Да"}
                </Button>
                <Button variant="ghost" size="sm" className="flex-1 text-xs h-7" onClick={() => setConfirmReset(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────

export default function Learning() {
  const [allEvents, setAllEvents] = useState<LearningEvent[]>([]);
  const [activeTab, setActiveTab] = useState<string>("all");
  const lastIdRef = useRef<string | undefined>(undefined);
  const queryClient = useQueryClient();

  const { data, isError } = useQuery<FeedResponse>({
    queryKey: ["learning-feed"],
    queryFn: async () => {
      const url = lastIdRef.current
        ? `/api/learning/feed?since=${lastIdRef.current}&limit=200`
        : "/api/learning/feed?limit=200";
      const r = await fetch(url);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<FeedResponse>;
    },
    refetchInterval: 1500,
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/corpus/reset", { method: "POST" });
      if (!r.ok) throw new Error("Reset failed");
      return r.json();
    },
    onSuccess: () => {
      setAllEvents([]);
      lastIdRef.current = undefined;
      queryClient.invalidateQueries({ queryKey: ["corpus-stats"] });
      queryClient.invalidateQueries({ queryKey: ["learning-feed"] });
    },
  });

  // Накапливаем события incremental
  useEffect(() => {
    if (!data?.events?.length) return;
    const newEvs = data.events;
    if (newEvs.length > 0) {
      lastIdRef.current = newEvs[newEvs.length - 1]!.id;
      setAllEvents((prev) => {
        const combined = [...prev, ...newEvs];
        return combined.slice(-2000);
      });
    }
  }, [data]);

  const stats = data?.stats ?? null;
  const accumulator = data?.accumulator ?? [];

  // Вкладки: "all" + все активные каналы из stats
  const channels = stats?.active_channels ?? [];
  const tabs: Array<{ id: string; label: string }> = [
    { id: "all", label: "Все источники" },
    ...channels.map((ch) => ({ id: ch, label: ch })),
  ];

  // Фильтруем события по вкладке
  const filteredEvents =
    activeTab === "all"
      ? allEvents
      : allEvents.filter((e) => e.channel === activeTab);

  // Автовыбор первого канала если он появился
  useEffect(() => {
    if (activeTab === "all" && channels.length === 1 && channels[0]) {
      // не переключаем автоматически — пусть пользователь сам
    }
  }, [channels.length]);

  // Счётчики для текущей вкладки
  const tabMsgCount = filteredEvents.filter((e) => e.type === "msg_classified").length;
  const tabPatternCount = filteredEvents.filter((e) => e.type === "pattern_new").length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <BrainCircuit className="w-4.5 h-4.5 text-primary" />
            Обучение ИИ
          </h1>
          <p className="text-xs text-muted-foreground/40 mt-0.5">
            Живой IRC → классификация → паттерны → база
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs font-mono">
          {isError && <span className="text-red-400/70 border border-red-500/20 rounded px-2 py-1">API error</span>}
          {stats && stats.active_channels.length > 0 ? (
            <span className="flex items-center gap-1.5 text-emerald-400 border border-emerald-500/20 rounded-lg px-3 py-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {stats.active_channels.length} активных сессий
            </span>
          ) : (
            <span className="text-muted-foreground/30 border border-white/5 rounded-lg px-3 py-1.5">нет сессий</span>
          )}
          <span className="text-muted-foreground/30 border border-white/5 rounded-lg px-3 py-1.5">
            {allEvents.filter(e => e.type === "msg_classified").length.toLocaleString()} сообщ.
            <span className="text-emerald-400 ml-2">+{allEvents.filter(e => e.type === "pattern_new").length}</span>
          </span>
        </div>
      </div>

      {/* Tab bar */}
      {tabs.length > 1 && (
        <div className="flex items-center gap-0.5 px-4 py-2 border-b border-border/40 bg-card/10 shrink-0 overflow-x-auto">
          {tabs.map((tab) => {
            const chStats = tab.id !== "all" ? stats?.per_channel?.[tab.id] : null;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap",
                  activeTab === tab.id
                    ? "bg-primary/10 text-primary border border-primary/20"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                )}
              >
                {tab.id === "all" ? (
                  <Layers className="w-3 h-3 shrink-0" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 shrink-0" />
                )}
                {tab.label}
                {chStats && (
                  <span className={cn(
                    "text-[10px] rounded px-1 py-0.5",
                    activeTab === tab.id ? "bg-primary/20 text-primary" : "bg-muted/40 text-muted-foreground"
                  )}>
                    {chStats.processed}
                  </span>
                )}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground shrink-0">
            {activeTab !== "all" && (
              <>
                <span>{tabMsgCount} сообщ.</span>
                <span className="text-green-400 ml-1">+{tabPatternCount} паттернов</span>
              </>
            )}
          </div>
        </div>
      )}

      {/* Main content: Chat | Patterns | Stats */}
      <div className="flex-1 overflow-hidden flex min-h-0">
        {/* Left: Message stream */}
        <div className="flex-1 border-r border-border/40 flex flex-col min-h-0 min-w-0">
          <MessageStream events={filteredEvents} />
        </div>

        {/* Middle: Pattern events */}
        <div className="w-[300px] border-r border-border/40 flex flex-col min-h-0 shrink-0">
          <LearningFeed events={filteredEvents} />
        </div>

        {/* Right: Stats */}
        <div className="w-[240px] shrink-0 overflow-y-auto border-l border-border/40">
          <StatsPanel
            stats={stats}
            accumulator={activeTab === "all" ? accumulator : accumulator.filter((a) => a.channel === activeTab)}
            onReset={() => resetMutation.mutate()}
            isResetting={resetMutation.isPending}
          />
        </div>
      </div>
    </div>
  );
}
