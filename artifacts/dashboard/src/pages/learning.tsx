import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { BrainCircuit, Sparkles, TrendingUp, Database, Radio, RefreshCw, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// ─── Types ─────────────────────────────────────────────────────────────────

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

// ─── Constants ─────────────────────────────────────────────────────────────

const TYPE_LABELS: Record<string, string> = {
  cs2_callout: "callout",
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
  russian_slang: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  hype: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  joke: "bg-pink-500/15 text-pink-400 border-pink-500/30",
  question: "bg-cyan-500/15 text-cyan-400 border-cyan-500/30",
  emote_combo: "bg-orange-500/15 text-orange-400 border-orange-500/30",
  reaction: "bg-green-500/15 text-green-400 border-green-500/30",
  game_specific: "bg-slate-500/15 text-slate-400 border-slate-500/30",
};

const LANG_COLORS: Record<string, string> = {
  ru: "bg-red-500/10 text-red-400",
  en: "bg-sky-500/10 text-sky-400",
  mixed: "bg-amber-500/10 text-amber-400",
};

// ─── Helpers ───────────────────────────────────────────────────────────────

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  if (diff < 5000) return "сейчас";
  if (diff < 60000) return `${Math.floor(diff / 1000)}с назад`;
  return `${Math.floor(diff / 60000)}м назад`;
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

// ─── Stream Column ──────────────────────────────────────────────────────────

function MessageStream({ events }: { events: LearningEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const msgs = events
    .filter((e) => e.type === "msg_classified" && e.msg)
    .slice(-80);

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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-green-400" />
          <span className="text-sm font-medium">Входящий поток</span>
          <span className="text-xs text-muted-foreground">каждое сообщение IRC</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400">live</span>
        </div>
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1 font-mono text-xs"
      >
        {msgs.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-xs">
            Ожидание IRC сессий...<br />
            <span className="text-[11px]">Перейди на вкладку Стримеры и запусти запись</span>
          </div>
        )}
        {msgs.map((e) => (
          <div key={e.id} className="flex gap-2 items-start group hover:bg-accent/30 rounded px-1.5 py-1 transition-colors">
            <span className="text-muted-foreground/50 shrink-0 mt-0.5 w-8 text-right">
              {new Date(e.ts).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
            <span className="text-primary/80 shrink-0 font-semibold min-w-[80px] max-w-[100px] truncate">
              {e.msg!.user}
            </span>
            <span className="text-foreground/90 flex-1 break-all leading-relaxed">
              {e.msg!.text}
            </span>
            <div className="flex gap-1 shrink-0 items-start mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
              {e.classification && (
                <>
                  <TypeBadge type={e.classification.pattern_type} />
                  <LangBadge lang={e.classification.lang} />
                </>
              )}
            </div>
          </div>
        ))}
      </div>
      {!autoScroll && (
        <button
          className="mx-3 mb-2 text-xs text-muted-foreground hover:text-foreground py-1.5 border border-border/50 rounded flex items-center justify-center gap-1"
          onClick={() => { setAutoScroll(true); if (ref.current) ref.current.scrollTop = ref.current.scrollHeight; }}
        >
          <RefreshCw className="w-3 h-3" /> прокрутить вниз
        </button>
      )}
    </div>
  );
}

// ─── Learning Events Column ─────────────────────────────────────────────────

function LearningFeed({ events }: { events: LearningEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  const relevant = events
    .filter((e) => e.type !== "msg_classified")
    .slice(-100);

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
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <BrainCircuit className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">Обнаружение паттернов</span>
        </div>
        <Badge variant="outline" className="text-[10px] h-5 px-1.5">
          {relevant.length} событий
        </Badge>
      </div>
      <div
        ref={ref}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1.5"
      >
        {relevant.length === 0 && (
          <div className="text-center text-muted-foreground py-12 text-xs">
            Паттерны появятся как только<br />IRC сессия начнёт получать сообщения
          </div>
        )}
        {relevant.map((e) => (
          <div key={e.id} className={cn(
            "rounded-lg px-3 py-2 border text-xs",
            e.type === "pattern_new"
              ? "bg-green-500/5 border-green-500/20"
              : e.type === "pattern_updated"
              ? "bg-blue-500/5 border-blue-500/20"
              : "bg-muted/30 border-border/50"
          )}>
            {e.type === "pattern_new" && e.pattern && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3 text-green-400 shrink-0" />
                  <span className="text-green-400 font-medium">Новый паттерн</span>
                  <span className="text-muted-foreground ml-auto">{e.channel}</span>
                </div>
                <div className="text-foreground/90 font-mono break-all pl-4">
                  "{e.pattern.content}"
                </div>
                <div className="flex gap-1 pl-4">
                  <TypeBadge type={e.pattern.pattern_type} />
                </div>
              </div>
            )}
            {e.type === "pattern_updated" && e.pattern && (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-blue-400 shrink-0" />
                  <span className="text-blue-400 font-medium">
                    ×{e.pattern.frequency} повторений
                  </span>
                  <TypeBadge type={e.pattern.pattern_type} />
                  <span className="text-muted-foreground ml-auto text-[10px]">{e.channel}</span>
                </div>
                <div className="text-foreground/70 font-mono break-all pl-4 truncate">
                  "{e.pattern.content}"
                </div>
              </div>
            )}
            {e.type === "batch_flushed" && e.batch_stats && (
              <div className="flex items-center gap-2">
                <Database className="w-3 h-3 text-amber-400 shrink-0" />
                <span className="text-amber-400 font-medium">Записано в БД</span>
                <span className="text-muted-foreground">
                  {e.batch_stats.saved} паттернов из {e.batch_stats.processed} — {e.channel}
                </span>
                <span className="text-muted-foreground ml-auto text-[10px]">{timeAgo(e.ts)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Stats Column ───────────────────────────────────────────────────────────

function StatsPanel({
  stats,
  accumulator,
}: {
  stats: LearningStats | null;
  accumulator: AccumulatorEntry[];
}) {
  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <Database className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium">Статистика</span>
      </div>

      <div className="p-4 space-y-4">
        {/* Счётчики */}
        <div className="grid grid-cols-2 gap-3">
          {[
            { label: "Обработано", value: stats?.total_processed ?? 0, color: "text-foreground" },
            { label: "Новых паттернов", value: stats?.total_new_patterns ?? 0, color: "text-green-400" },
            { label: "Обновлено", value: stats?.total_updated_patterns ?? 0, color: "text-blue-400" },
            { label: "Flush в БД", value: stats?.total_batches_flushed ?? 0, color: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-card/50 rounded-lg p-3 border border-border/50">
              <div className={cn("text-2xl font-bold tabular-nums", s.color)}>{s.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Активные каналы */}
        {stats && stats.active_channels.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Активные каналы</div>
            <div className="flex flex-wrap gap-1.5">
              {stats.active_channels.map((ch) => (
                <span key={ch} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary border border-primary/20 rounded px-2 py-0.5">
                  <span className="w-1 h-1 rounded-full bg-green-400 animate-pulse" />
                  {ch}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Аккумулятор — что сейчас в памяти */}
        {accumulator.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              В памяти (до flush)
            </div>
            {accumulator.map((acc) => (
              <div key={acc.channel} className="bg-card/50 rounded-lg border border-border/50 overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-card/80">
                  <span className="text-xs font-semibold">{acc.channel}</span>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5">
                    {acc.pending} уник.
                  </Badge>
                </div>
                <div className="p-2 space-y-1">
                  {acc.top5.map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs">
                      <span className="text-muted-foreground w-3 text-right shrink-0">{p.count}×</span>
                      <span className="font-mono flex-1 truncate text-foreground/80">"{p.content}"</span>
                      <TypeBadge type={p.type} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Per-channel breakdown */}
        {stats && Object.keys(stats.per_channel).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">По каналам</div>
            <div className="space-y-2">
              {Object.entries(stats.per_channel).map(([ch, s]) => (
                <div key={ch} className="flex items-center gap-2">
                  <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  <span className="text-xs font-medium w-24 truncate">{ch}</span>
                  <div className="flex-1 flex gap-2 text-[11px] text-muted-foreground">
                    <span>{s.processed} сообщ.</span>
                    <span className="text-green-400">+{s.new_patterns}</span>
                    <span className="text-blue-400">↑{s.updated}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Пояснение пайплайна */}
        <div className="rounded-lg border border-border/50 bg-card/30 p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Пайплайн</div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            {[
              { icon: "📡", text: "IRC сессия захватывает все сообщения" },
              { icon: "🧠", text: "Каждое сообщение классифицируется on-the-fly" },
              { icon: "💾", text: "Аккумулируется в памяти (100 сообщ. → flush)" },
              { icon: "📦", text: "Flush записывает топ-250 паттернов в PostgreSQL" },
              { icon: "🤖", text: "Бот использует паттерны при генерации ответов" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0">{step.icon}</span>
                <span>{step.text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Learning() {
  const [allEvents, setAllEvents] = useState<LearningEvent[]>([]);
  const lastIdRef = useRef<string | undefined>(undefined);

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

  useEffect(() => {
    if (!data?.events?.length) return;
    setAllEvents((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const newOnes = data.events.filter((e) => !ids.has(e.id));
      if (!newOnes.length) return prev;
      const merged = [...prev, ...newOnes];
      // Держим последние 800 событий в памяти
      return merged.slice(-800);
    });
    // Запоминаем последний id для delta-запросов
    const last = data.events[data.events.length - 1];
    if (last) lastIdRef.current = last.id;
  }, [data]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border/50 flex items-center px-6 gap-3 shrink-0 bg-card/30">
        <BrainCircuit className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-sm font-semibold">Обучение ИИ</h1>
          <p className="text-xs text-muted-foreground">Непрерывный self-learning на основе живых IRC сессий</p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {isError && (
            <span className="text-xs text-destructive">Ошибка соединения</span>
          )}
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs text-muted-foreground">
              {allEvents.length} событий
            </span>
          </div>
        </div>
      </header>

      {/* Three-column layout */}
      <div className="flex-1 grid grid-cols-[1fr_1fr_320px] divide-x divide-border/50 overflow-hidden">
        {/* Левая колонка: сырой поток */}
        <MessageStream events={allEvents} />

        {/* Центральная: события обучения */}
        <LearningFeed events={allEvents} />

        {/* Правая: статистика */}
        <StatsPanel
          stats={data?.stats ?? null}
          accumulator={data?.accumulator ?? []}
        />
      </div>
    </div>
  );
}
