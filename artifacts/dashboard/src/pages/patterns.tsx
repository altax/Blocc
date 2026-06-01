import { useState, useMemo } from "react";
import {
  useGetPatterns,
  useGetStreamerPresets,
  useLearnFromChannel,
  useBulkLearnFromStreamers,
  useClearPatterns,
  getGetPatternsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import {
  Hash, Download, Loader2, Zap, Trash2,
  Brain, BarChart2, Sparkles, RefreshCw,
  ChevronRight, Filter, Search, Bot,
} from "lucide-react";

const PATTERN_META: Record<string, { label: string; color: string; bg: string }> = {
  cs2_callout:   { label: "CS2 каллаут",  color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30" },
  russian_slang: { label: "Рус. сленг",   color: "text-purple-400", bg: "bg-purple-500/10 border-purple-500/30" },
  hype:          { label: "Хайп",         color: "text-green-400",  bg: "bg-green-500/10  border-green-500/30"  },
  joke:          { label: "Юмор",         color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/30" },
  question:      { label: "Вопрос",       color: "text-blue-400",   bg: "bg-blue-500/10   border-blue-500/30"   },
  emote_combo:   { label: "Эмоуты",       color: "text-pink-400",   bg: "bg-pink-500/10   border-pink-500/30"   },
  reaction:      { label: "Реакция",      color: "text-cyan-400",   bg: "bg-cyan-500/10   border-cyan-500/30"   },
  game_specific: { label: "Игровое",      color: "text-muted-foreground", bg: "bg-muted/20 border-border/40" },
};

function patternMeta(type: string) {
  return PATTERN_META[type] ?? { label: type, color: "text-muted-foreground", bg: "bg-muted/20 border-border/40" };
}

function FrequencyBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <div className="h-1 bg-muted/30 rounded-full overflow-hidden">
      <div
        className="h-full bg-primary/60 rounded-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

// ── Карточка паттерна ─────────────────────────────────────────────────────
function PatternCard({
  pattern,
  maxFreq,
  isTopAI,
  rank,
}: {
  pattern: {
    id: number; source_channel: string; pattern_type: string;
    content: string; frequency: number; language: string; game: string;
  };
  maxFreq: number;
  isTopAI: boolean;
  rank?: number;
}) {
  const meta = patternMeta(pattern.pattern_type);
  return (
    <div className={cn(
      "rounded-lg border p-3 transition-all hover:border-border/70 relative",
      isTopAI ? "border-primary/30 bg-primary/5" : "border-border/30 bg-card/30"
    )}>
      {isTopAI && rank !== undefined && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center shadow">
          {rank}
        </div>
      )}
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <Badge variant="outline" className={cn("text-[9px] font-mono uppercase tracking-wider shrink-0 border", meta.bg, meta.color)}>
          {meta.label}
        </Badge>
        <div className="flex items-center gap-1.5 shrink-0">
          {pattern.language === "ru" && (
            <span className="text-[9px] font-mono text-purple-400/70">RU</span>
          )}
          {pattern.game === "cs2" && (
            <span className="text-[9px] font-mono text-orange-400/70">CS2</span>
          )}
          <span className="text-[9px] text-muted-foreground font-mono">×{pattern.frequency}</span>
        </div>
      </div>
      <div className="text-sm font-medium text-foreground/90 leading-relaxed mb-2 break-words">
        "{pattern.content}"
      </div>
      <div className="space-y-1">
        <FrequencyBar value={pattern.frequency} max={maxFreq} />
        <div className="text-[9px] font-mono text-muted-foreground/50">
          ↑ {pattern.source_channel}
        </div>
      </div>
    </div>
  );
}

// ── Строка стримера в левой панели ─────────────────────────────────────────
function StreamerLearnRow({
  channel,
  displayName,
  description,
  patternCount,
  isLearning,
  onLearn,
  isSelected,
  onSelect,
}: {
  channel: string;
  displayName: string;
  description: string;
  patternCount: number;
  isLearning: boolean;
  onLearn: () => void;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all group",
        isSelected
          ? "border-primary/40 bg-primary/10"
          : "border-border/30 hover:border-border/60 bg-card/20 hover:bg-card/40"
      )}
      onClick={onSelect}
    >
      <div className={cn(
        "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
        patternCount > 0 ? "bg-primary/20 text-primary" : "bg-muted/30 text-muted-foreground"
      )}>
        {displayName[0].toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium">{displayName}</span>
          {patternCount > 0 && (
            <span className="text-[9px] font-mono text-primary/70 bg-primary/10 px-1 py-0.5 rounded">{patternCount}</span>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground truncate">{description}</div>
      </div>

      <Button
        size="sm"
        variant="ghost"
        className={cn(
          "h-6 w-6 p-0 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity",
          isLearning && "opacity-100"
        )}
        onClick={(e) => { e.stopPropagation(); onLearn(); }}
        disabled={isLearning}
        title="Собрать паттерны"
      >
        {isLearning
          ? <Loader2 className="w-3 h-3 animate-spin text-primary" />
          : <Download className="w-3 h-3 text-muted-foreground" />}
      </Button>
    </div>
  );
}

// ── Главная страница ─────────────────────────────────────────────────────────
export default function Patterns() {
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterChannel, setFilterChannel] = useState<string>("all");
  const [learningChannels, setLearningChannels] = useState<Set<string>>(new Set());
  const [bulkActive, setBulkActive] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetPatternsQueryKey({ limit: 500 }) });

  const { data: patterns, isLoading: patternsLoading } = useGetPatterns(
    { limit: 500 },
    { query: { queryKey: getGetPatternsQueryKey({ limit: 500 }), refetchInterval: 10000 } }
  );

  const { data: presets } = useGetStreamerPresets();

  const learnMutation = useLearnFromChannel({
    mutation: {
      onSuccess: (_, vars) => {
        const ch = (vars.data as any).channel;
        toast({ title: "Обучение запущено", description: `Собираю паттерны: ${ch}` });
        setTimeout(invalidate, 15000);
        setTimeout(() => {
          setLearningChannels((prev) => { const s = new Set(prev); s.delete(ch); return s; });
        }, 60000);
      },
      onError: (err: any) => {
        toast({ title: "Ошибка обучения", description: err.message, variant: "destructive" });
      },
    },
  });

  const bulkMutation = useBulkLearnFromStreamers({
    mutation: {
      onSuccess: (res) => {
        setBulkActive(true);
        toast({
          title: "Массовое обучение запущено",
          description: `${res.total_channels} каналов · ~15–30 мин`,
        });
        setTimeout(() => { setBulkActive(false); invalidate(); }, 120000);
      },
      onError: (err: any) => {
        toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      },
    },
  });

  const clearMutation = useClearPatterns({
    mutation: {
      onSuccess: (res) => {
        toast({ title: "База паттернов очищена", description: `Удалено ${res.deleted} записей` });
        invalidate();
      },
    },
  });

  const handleLearn = (channel: string) => {
    setLearningChannels((prev) => new Set([...prev, channel]));
    learnMutation.mutate({ data: { channel, message_count: 500 } });
  };

  const handleBulkLearn = () => {
    bulkMutation.mutate({ data: { message_count_per_channel: 300 } });
  };

  // ── Вычисления ──────────────────────────────────────────────────────────
  const allPatterns = patterns ?? [];
  const maxFreq = useMemo(() => Math.max(0, ...allPatterns.map((p) => p.frequency)), [allPatterns]);

  // Паттерны которые ИИ реально использует (top 20 по частоте) 
  const topAIPatterns = useMemo(() => {
    return [...allPatterns].sort((a, b) => b.frequency - a.frequency).slice(0, 20);
  }, [allPatterns]);
  const topAIIds = new Set(topAIPatterns.map((p) => p.id));

  // Статистика по каналам
  const channelStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allPatterns) {
      map.set(p.source_channel, (map.get(p.source_channel) ?? 0) + 1);
    }
    return map;
  }, [allPatterns]);

  // Статистика по типам
  const typeStats = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of allPatterns) {
      map.set(p.pattern_type, (map.get(p.pattern_type) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [allPatterns]);

  // Фильтрация паттернов
  const filteredPatterns = useMemo(() => {
    return allPatterns.filter((p) => {
      if (filterType !== "all" && p.pattern_type !== filterType) return false;
      if (filterChannel !== "all" && p.source_channel !== filterChannel) return false;
      if (selectedChannel && p.source_channel !== selectedChannel) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return p.content.toLowerCase().includes(q) || p.source_channel.toLowerCase().includes(q);
      }
      return true;
    });
  }, [allPatterns, filterType, filterChannel, selectedChannel, searchQuery]);

  const totalCount = allPatterns.length;
  const ruCount = allPatterns.filter((p) => (p as any).language === "ru").length;
  const cs2Count = allPatterns.filter((p) => (p as any).game === "cs2").length;
  const channelCount = channelStats.size;

  const channels = presets ?? [];

  return (
    <div className="flex h-full overflow-hidden">

      {/* ══════════════════════════════════════════════════════════════════
          ЛЕВАЯ ПАНЕЛЬ — Источники обучения
      ══════════════════════════════════════════════════════════════════ */}
      <div className="w-64 border-r border-border/50 flex flex-col bg-card/20 shrink-0">
        {/* Заголовок */}
        <div className="px-4 py-4 border-b border-border/50">
          <div className="flex items-center gap-2 mb-0.5">
            <Brain className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">Источники</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Стримеры для обучения ИИ
          </p>
        </div>

        {/* Быстрые действия */}
        <div className="px-3 py-2 border-b border-border/30 space-y-1.5">
          <Button
            className="w-full h-8 text-xs gap-1.5 justify-start"
            onClick={handleBulkLearn}
            disabled={bulkMutation.isPending || bulkActive}
          >
            {bulkMutation.isPending || bulkActive
              ? <><Loader2 className="w-3 h-3 animate-spin" /> Обучаемся...</>
              : <><Zap className="w-3 h-3" /> Обучить по всем</>}
          </Button>
          {totalCount > 0 && (
            <Button
              variant="outline"
              className="w-full h-7 text-xs gap-1.5 justify-start border-destructive/30 text-destructive hover:bg-destructive/10"
              onClick={() => clearMutation.mutate()}
              disabled={clearMutation.isPending}
            >
              {clearMutation.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Trash2 className="w-3 h-3" />}
              Очистить базу
            </Button>
          )}
        </div>

        {/* Список стримеров */}
        <ScrollArea className="flex-1">
          <div className="px-2 py-2 space-y-1">
            {/* "Все" */}
            <div
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-all text-xs",
                !selectedChannel
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "border-transparent hover:border-border/50 text-muted-foreground hover:text-foreground"
              )}
              onClick={() => setSelectedChannel(null)}
            >
              <Hash className="w-3.5 h-3.5" />
              <span className="font-medium">Все каналы</span>
              {totalCount > 0 && (
                <span className="ml-auto text-[10px] font-mono opacity-70">{totalCount}</span>
              )}
            </div>

            {channels.map((p) => (
              <StreamerLearnRow
                key={p.channel}
                channel={p.channel}
                displayName={p.displayName}
                description={p.description}
                patternCount={channelStats.get(p.channel) ?? 0}
                isLearning={learningChannels.has(p.channel)}
                onLearn={() => handleLearn(p.channel)}
                isSelected={selectedChannel === p.channel}
                onSelect={() => setSelectedChannel(
                  selectedChannel === p.channel ? null : p.channel
                )}
              />
            ))}
          </div>
        </ScrollArea>

        {/* Итог */}
        {totalCount > 0 && (
          <div className="px-4 py-3 border-t border-border/30 space-y-1 text-[10px] text-muted-foreground font-mono">
            <div className="flex justify-between">
              <span>Всего паттернов</span>
              <span className="text-foreground font-semibold">{totalCount}</span>
            </div>
            <div className="flex justify-between">
              <span>Русских</span>
              <span className="text-purple-400">{ruCount}</span>
            </div>
            <div className="flex justify-between">
              <span>CS2</span>
              <span className="text-orange-400">{cs2Count}</span>
            </div>
            <div className="flex justify-between">
              <span>Каналов</span>
              <span className="text-blue-400">{channelCount}</span>
            </div>
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          ПРАВАЯ ПАНЕЛЬ — База паттернов
      ══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Заголовок правой панели */}
        <div className="px-6 py-4 border-b border-border/50 flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-lg font-semibold flex items-center gap-2">
              <Bot className="w-5 h-5 text-primary" />
              База паттернов ИИ
              {selectedChannel && (
                <Badge variant="outline" className="text-xs border-primary/40 text-primary font-mono">
                  {selectedChannel}
                </Badge>
              )}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Что бот знает · На чём обучен · Что использует при генерации
            </p>
          </div>
          <Button
            size="sm" variant="ghost"
            className="h-8 w-8 p-0 text-muted-foreground"
            onClick={invalidate}
            title="Обновить"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        {/* ── Статистика по типам ─────────────────────────────────────── */}
        {totalCount > 0 && (
          <div className="px-6 py-3 border-b border-border/30 flex gap-4 overflow-x-auto shrink-0">
            {typeStats.slice(0, 6).map(([type, count]) => {
              const meta = patternMeta(type);
              return (
                <button
                  key={type}
                  onClick={() => setFilterType(filterType === type ? "all" : type)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs whitespace-nowrap transition-all shrink-0",
                    filterType === type
                      ? `border-primary/40 bg-primary/10 text-primary`
                      : `border-border/30 hover:border-border/60 ${meta.color}`
                  )}
                >
                  <span className={cn("font-medium", filterType === type ? "text-primary" : meta.color)}>
                    {patternMeta(type).label}
                  </span>
                  <span className="font-mono opacity-60">{count}</span>
                </button>
              );
            })}
            {filterType !== "all" && (
              <button
                onClick={() => setFilterType("all")}
                className="flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                Сбросить ✕
              </button>
            )}
          </div>
        )}

        {/* ── ТОП-20: что использует ИИ ──────────────────────────────── */}
        {topAIPatterns.length > 0 && !selectedChannel && filterType === "all" && !searchQuery && (
          <div className="px-6 py-4 border-b border-border/30 bg-primary/3 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">ТОП-20: что ИИ вставляет в сообщения</span>
              <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                30% шанс использования
              </Badge>
            </div>
            <div className="flex flex-wrap gap-2">
              {topAIPatterns.map((p, i) => (
                <div
                  key={p.id}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary/10 border border-primary/20 rounded-lg text-xs group relative cursor-default"
                  title={`${p.source_channel} · ×${p.frequency} · ${patternMeta(p.pattern_type).label}`}
                >
                  <span className="text-[9px] text-primary/50 font-mono">{i + 1}</span>
                  <span className="text-foreground/90 font-medium max-w-[140px] truncate">
                    {p.content}
                  </span>
                  <span className={cn("text-[9px] font-mono", patternMeta(p.pattern_type).color)}>
                    ×{p.frequency}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Поиск и фильтры ────────────────────────────────────────── */}
        <div className="px-6 py-3 border-b border-border/30 flex items-center gap-3 shrink-0">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <Input
              placeholder="Поиск паттернов..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 h-8 text-xs bg-muted/30 border-border/50"
            />
          </div>
          <div className="text-xs text-muted-foreground">
            {filteredPatterns.length} из {totalCount}
            {selectedChannel && <span className="text-primary ml-1">· {selectedChannel}</span>}
          </div>
        </div>

        {/* ── Список паттернов ────────────────────────────────────────── */}
        <ScrollArea className="flex-1">
          <div className="px-6 py-4">
            {patternsLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {[...Array(12)].map((_, i) => (
                  <div key={i} className="rounded-lg border border-border/30 p-3 space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-full" />
                    <Skeleton className="h-2 w-full" />
                  </div>
                ))}
              </div>
            ) : filteredPatterns.length === 0 ? (
              <div className="py-20 text-center">
                <Hash className="w-12 h-12 mx-auto mb-4 opacity-15" />
                {totalCount === 0 ? (
                  <>
                    <p className="font-medium mb-1">База пустая</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Выбери стримеров слева и запусти обучение
                    </p>
                    <Button onClick={handleBulkLearn} disabled={bulkMutation.isPending || bulkActive} className="gap-2">
                      <Zap className="w-4 h-4" />
                      Обучить по всем стримерам
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="font-medium mb-1">Ничего не найдено</p>
                    <button
                      className="text-sm text-primary hover:underline"
                      onClick={() => { setSearchQuery(""); setFilterType("all"); setSelectedChannel(null); }}
                    >
                      Сбросить фильтры
                    </button>
                  </>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {filteredPatterns.map((pattern) => {
                  const aiRank = topAIIds.has(pattern.id)
                    ? topAIPatterns.findIndex((p) => p.id === pattern.id) + 1
                    : undefined;
                  return (
                    <PatternCard
                      key={pattern.id}
                      pattern={pattern as any}
                      maxFreq={maxFreq}
                      isTopAI={topAIIds.has(pattern.id)}
                      rank={aiRank}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </ScrollArea>

        {/* ── Нижняя строка: как ИИ использует паттерны ─────────────── */}
        <div className="px-6 py-2.5 border-t border-border/30 bg-muted/10 flex items-center gap-3 text-[11px] text-muted-foreground shrink-0">
          <Brain className="w-3.5 h-3.5 shrink-0" />
          <span>
            При генерации: <span className="text-foreground">30% шанс</span> — ИИ берёт случайный паттерн из топ-20 и вставляет в начало или конец сообщения
          </span>
          <span className="mx-1">·</span>
          <span><span className="text-foreground">18% сообщений</span> — симуляция опечаток</span>
          <span className="mx-1">·</span>
          <span><span className="text-foreground">15% шанс</span> — промолчать</span>
        </div>
      </div>
    </div>
  );
}
