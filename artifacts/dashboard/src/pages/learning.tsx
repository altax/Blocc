import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { BrainCircuit, Sparkles, TrendingUp, Database, Radio, RefreshCw, ChevronRight, Trash2, FileText, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

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

interface CorpusStats {
  file: string;
  total_messages: number;
  size_bytes: number;
  exists: boolean;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(2)} MB`;
}

function StatsPanel({
  stats,
  accumulator,
  onReset,
  isResetting,
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
      if (!r.ok) throw new Error("corpus stats failed");
      return r.json();
    },
    refetchInterval: 3000,
  });

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border/50">
        <Database className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium">Статистика</span>
      </div>

      <div className="p-4 space-y-4">

        {/* Corpus file status — главный блок */}
        <div className={cn(
          "rounded-lg border p-3 space-y-2",
          corpusStats?.exists
            ? "bg-green-500/5 border-green-500/20"
            : "bg-muted/20 border-border/50"
        )}>
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-green-400 shrink-0" />
            <span className="text-xs font-semibold">Корпус обучения</span>
            <span className={cn(
              "ml-auto text-[10px] px-1.5 py-0.5 rounded",
              corpusStats?.exists ? "bg-green-500/15 text-green-400" : "bg-muted/50 text-muted-foreground"
            )}>
              {corpusStats?.exists ? "активен" : "пуст"}
            </span>
          </div>
          <div className="font-mono text-[10px] text-muted-foreground break-all">
            data/corpus/messages.jsonl
          </div>
          {corpusStats?.exists && (
            <div className="grid grid-cols-2 gap-2 pt-1">
              <div className="bg-background/40 rounded p-2">
                <div className="text-lg font-bold text-green-400 tabular-nums">
                  {corpusStats.total_messages.toLocaleString()}
                </div>
                <div className="text-[10px] text-muted-foreground">сообщений</div>
              </div>
              <div className="bg-background/40 rounded p-2">
                <div className="text-lg font-bold tabular-nums">
                  {formatBytes(corpusStats.size_bytes)}
                </div>
                <div className="text-[10px] text-muted-foreground">размер файла</div>
              </div>
            </div>
          )}
        </div>

        {/* Счётчики сессии */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "Обработано", value: stats?.total_processed ?? 0, color: "text-foreground" },
            { label: "Новых паттернов", value: stats?.total_new_patterns ?? 0, color: "text-green-400" },
            { label: "Обновлено", value: stats?.total_updated_patterns ?? 0, color: "text-blue-400" },
            { label: "Flush в БД", value: stats?.total_batches_flushed ?? 0, color: "text-amber-400" },
          ].map((s) => (
            <div key={s.label} className="bg-card/50 rounded-lg p-2.5 border border-border/50">
              <div className={cn("text-xl font-bold tabular-nums", s.color)}>{s.value.toLocaleString()}</div>
              <div className="text-[10px] text-muted-foreground mt-0.5">{s.label}</div>
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

        {/* Аккумулятор */}
        {accumulator.length > 0 && (
          <div className="space-y-2">
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

        {/* Per-channel */}
        {stats && Object.keys(stats.per_channel).length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">По каналам</div>
            <div className="space-y-1.5">
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

        {/* Пайплайн */}
        <div className="rounded-lg border border-border/50 bg-card/30 p-3 space-y-2">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Пайплайн</div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            {[
              { icon: "📡", text: "IRC → все сообщения в messages.jsonl" },
              { icon: "🧠", text: "Каждое сообщение классифицируется on-the-fly" },
              { icon: "💾", text: "Аккумулятор в памяти → flush каждые 100 сообщ." },
              { icon: "📦", text: "Топ-250 паттернов (ru+cs2 приоритет) → PostgreSQL" },
              { icon: "🤖", text: "Бот инжектирует паттерны при генерации ответов" },
            ].map((step, i) => (
              <div key={i} className="flex items-start gap-2">
                <span className="shrink-0">{step.icon}</span>
                <span>{step.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Сброс обучения */}
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <Trash2 className="w-3.5 h-3.5 text-destructive shrink-0" />
            <span className="text-xs font-semibold text-destructive">Начать с нуля</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Удалит все паттерны из БД, все записанные сессии. Корпус messages.jsonl будет <strong>архивирован</strong> (не удалён), чтобы данные не пропали.
          </p>
          {!confirmReset ? (
            <Button
              variant="outline"
              size="sm"
              className="w-full text-xs border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive h-8"
              onClick={() => setConfirmReset(true)}
            >
              <Trash2 className="w-3 h-3 mr-1.5" />
              Сбросить обучение
            </Button>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                Точно? Это необратимо.
              </div>
              <div className="flex gap-2">
                <Button
                  variant="destructive"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => { onReset(); setConfirmReset(false); }}
                  disabled={isResetting}
                >
                  {isResetting ? "Сброс..." : "Да, удалить"}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-xs h-8"
                  onClick={() => setConfirmReset(false)}
                >
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

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function Learning() {
  const [allEvents, setAllEvents] = useState<LearningEvent[]>([]);
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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    },
    onSuccess: () => {
      // Очищаем локальные события и сбрасываем delta-cursor
      setAllEvents([]);
      lastIdRef.current = undefined;
      queryClient.invalidateQueries({ queryKey: ["corpus-stats"] });
      queryClient.invalidateQueries({ queryKey: ["learning-feed"] });
    },
  });

  useEffect(() => {
    if (!data?.events?.length) return;
    setAllEvents((prev) => {
      const ids = new Set(prev.map((e) => e.id));
      const newOnes = data.events.filter((e) => !ids.has(e.id));
      if (!newOnes.length) return prev;
      const merged = [...prev, ...newOnes];
      return merged.slice(-800);
    });
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
          <p className="text-xs text-muted-foreground">
            Непрерывный self-learning — каждое IRC сообщение попадает в корпус и классифицируется
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {resetMutation.isSuccess && (
            <span className="text-xs text-green-400">База сброшена ✓</span>
          )}
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
        <MessageStream events={allEvents} />
        <LearningFeed events={allEvents} />
        <StatsPanel
          stats={data?.stats ?? null}
          accumulator={data?.accumulator ?? []}
          onReset={() => resetMutation.mutate()}
          isResetting={resetMutation.isPending}
        />
      </div>
    </div>
  );
}
