import { useState } from "react";
import {
  useGetPatterns,
  useLearnFromChannel,
  useBulkLearnFromStreamers,
  useClearPatterns,
  getGetPatternsQueryKey,
} from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hash, Download, Loader2, Zap, Trash2, CheckCircle2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const RU_CS2_PRESETS = [
  { channel: "s1mple", label: "s1mple", desc: "Легенда CS2" },
  { channel: "electronic", label: "electronic", desc: "NaVi" },
  { channel: "b1t_cs", label: "b1t_cs", desc: "NaVi" },
  { channel: "sh1ro", label: "sh1ro", desc: "Cloud9" },
  { channel: "xsepower", label: "xsepower", desc: "Топ рус." },
  { channel: "nafany", label: "nafany", desc: "CS2 рус." },
  { channel: "buster_cs", label: "buster_cs", desc: "Рус. CS2" },
  { channel: "hobbit_cs", label: "hobbit_cs", desc: "Рус./каз." },
  { channel: "yekindar", label: "YEKINDAR", desc: "Топ игрок" },
  { channel: "forester_cs", label: "forester_cs", desc: "Рус. CS2" },
];

const PATTERN_LABELS: Record<string, string> = {
  cs2_callout: "CS2 каллаут",
  russian_slang: "Рус. сленг",
  hype: "Хайп",
  joke: "Юмор",
  question: "Вопрос",
  emote_combo: "Эмоуты",
  reaction: "Реакция",
  game_specific: "Игра",
};

const PATTERN_COLORS: Record<string, string> = {
  cs2_callout: "border-orange-500/40 text-orange-400",
  russian_slang: "border-purple-500/40 text-purple-400",
  hype: "border-green-500/40 text-green-400",
  joke: "border-yellow-500/40 text-yellow-400",
  question: "border-blue-500/40 text-blue-400",
  emote_combo: "border-pink-500/40 text-pink-400",
  reaction: "border-cyan-500/40 text-cyan-400",
  game_specific: "border-border text-muted-foreground",
};

export default function Patterns() {
  const [channelInput, setChannelInput] = useState("");
  const [selectedPresets, setSelectedPresets] = useState<Set<string>>(new Set());
  const [bulkActive, setBulkActive] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getGetPatternsQueryKey({ limit: 200 }) });

  const { data: patterns, isLoading } = useGetPatterns(
    { limit: 200 },
    { query: { queryKey: getGetPatternsQueryKey({ limit: 200 }) } }
  );

  const learnMutation = useLearnFromChannel({
    mutation: {
      onSuccess: (res) => {
        toast({ title: "Обучение запущено", description: `Сбор паттернов из ${res.channel}...` });
        setChannelInput("");
        setTimeout(invalidate, 10000);
      },
      onError: (err: any) => {
        toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      },
    },
  });

  const bulkMutation = useBulkLearnFromStreamers({
    mutation: {
      onSuccess: (res) => {
        setBulkActive(true);
        toast({
          title: "Массовое обучение запущено",
          description: `${res.total_channels} каналов в очереди. Займёт 15–30 минут.`,
        });
        setSelectedPresets(new Set());
        setTimeout(() => {
          setBulkActive(false);
          invalidate();
        }, 30000);
      },
      onError: (err: any) => {
        toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      },
    },
  });

  const clearMutation = useClearPatterns({
    mutation: {
      onSuccess: (res) => {
        toast({ title: "Паттерны удалены", description: `Удалено ${res.deleted} записей.` });
        invalidate();
      },
      onError: (err: any) => {
        toast({ title: "Ошибка", description: err.message, variant: "destructive" });
      },
    },
  });

  const handleLearn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelInput) return;
    learnMutation.mutate({ data: { channel: channelInput, message_count: 500 } });
  };

  const handleBulkLearn = () => {
    const channels = selectedPresets.size > 0 ? Array.from(selectedPresets) : undefined;
    bulkMutation.mutate({ data: { channels, message_count_per_channel: 300 } });
  };

  const togglePreset = (channel: string) => {
    setSelectedPresets((prev) => {
      const next = new Set(prev);
      if (next.has(channel)) next.delete(channel);
      else next.add(channel);
      return next;
    });
  };

  const ruCount = patterns?.filter((p) => (p as any).language === "ru").length ?? 0;
  const cs2Count = patterns?.filter((p) => (p as any).game === "cs2").length ?? 0;
  const channelSet = [...new Set(patterns?.map((p) => p.source_channel) ?? [])];

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full pb-20">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Обучение на паттернах</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Поведение реального чата для максимальной аутентичности.
          </p>
        </div>
        {(patterns?.length ?? 0) > 0 && (
          <Button
            variant="outline"
            size="sm"
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
            onClick={() => clearMutation.mutate()}
            disabled={clearMutation.isPending}
          >
            {clearMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4 mr-1" />
            )}
            Очистить всё
          </Button>
        )}
      </div>

      {/* Stats row */}
      {(patterns?.length ?? 0) > 0 && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Всего паттернов", value: patterns?.length ?? 0 },
            { label: "На русском", value: ruCount },
            { label: "CS2-специфичных", value: cs2Count },
            { label: "Каналов", value: channelSet.length },
          ].map(({ label, value }) => (
            <Card key={label} className="bg-card/50 border-border/50">
              <CardContent className="p-4">
                <div className="text-2xl font-bold text-primary">{value}</div>
                <div className="text-xs text-muted-foreground mt-1">{label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Bulk learn */}
      <Card className="bg-card/50 backdrop-blur-sm border-primary/20 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Zap className="w-5 h-5 mr-2 text-primary" />
            Массовое обучение — Топовые рус. CS2 стримеры
          </CardTitle>
          <CardDescription>
            Выбери каналы (или оставь все выбранными) и запусти одним кликом. Бот изучит живой чат и усвоит настоящий стиль.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {RU_CS2_PRESETS.map(({ channel, label, desc }) => {
              const selected = selectedPresets.has(channel);
              return (
                <button
                  key={channel}
                  type="button"
                  onClick={() => togglePreset(channel)}
                  className={cn(
                    "px-3 py-1.5 rounded-lg border text-xs font-medium transition-all",
                    selected
                      ? "bg-primary/20 border-primary text-primary"
                      : "bg-black/20 border-border/50 text-muted-foreground hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  <span className="font-semibold">{label}</span>
                  <span className="ml-1 opacity-60">{desc}</span>
                  {selected && <CheckCircle2 className="inline w-3 h-3 ml-1 text-primary" />}
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-4">
            <Button
              onClick={handleBulkLearn}
              disabled={bulkMutation.isPending || bulkActive}
              className="min-w-[220px]"
            >
              {bulkMutation.isPending || bulkActive ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Обучение идёт...</>
              ) : (
                <>
                  <Zap className="w-4 h-4 mr-2" />
                  {selectedPresets.size > 0
                    ? `Обучиться по ${selectedPresets.size} каналам`
                    : "Обучиться по всем (10 каналов)"}
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground">
              ~300 сообщений с канала · займёт 15–30 мин
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Single channel */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader>
          <CardTitle className="text-base flex items-center">
            <Download className="w-4 h-4 mr-2 text-primary" />
            Обучение по отдельному каналу
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLearn} className="flex gap-3 max-w-md">
            <Input
              placeholder="Имя канала (например: s1mple)"
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              className="bg-black/20"
            />
            <Button
              type="submit"
              disabled={!channelInput || learnMutation.isPending}
              className="min-w-[110px]"
            >
              {learnMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Сбор...</>
              ) : (
                "Собрать"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Patterns grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
          Выученные паттерны ({patterns?.length ?? 0})
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {isLoading ? (
            [...Array(9)].map((_, i) => (
              <Card key={i} className="bg-card/50 border-border/50">
                <CardContent className="p-4 space-y-3">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-3 w-14" />
                </CardContent>
              </Card>
            ))
          ) : (patterns?.length ?? 0) === 0 ? (
            <div className="col-span-full py-16 text-center text-muted-foreground border border-dashed rounded-lg border-border/50 bg-black/10">
              <Hash className="w-12 h-12 mx-auto mb-4 opacity-20" />
              <p className="font-medium mb-1">Паттернов ещё нет</p>
              <p className="text-sm opacity-60">
                Запусти массовое обучение по русским CS2 стримерам выше.
              </p>
            </div>
          ) : (
            patterns?.map((pattern) => (
              <Card
                key={pattern.id}
                className="bg-card/50 border-border/50 hover:border-border transition-colors"
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "font-mono text-[10px] uppercase tracking-wider",
                        PATTERN_COLORS[pattern.pattern_type] ?? PATTERN_COLORS.game_specific
                      )}
                    >
                      {PATTERN_LABELS[pattern.pattern_type] ?? pattern.pattern_type}
                    </Badge>
                    <div className="flex items-center gap-2">
                      {(pattern as any).language === "ru" && (
                        <span className="text-[10px] font-mono text-purple-400 opacity-70">RU</span>
                      )}
                      {(pattern as any).game === "cs2" && (
                        <span className="text-[10px] font-mono text-orange-400 opacity-70">CS2</span>
                      )}
                      <span className="text-[10px] text-muted-foreground">×{pattern.frequency}</span>
                    </div>
                  </div>
                  <div className="text-sm font-medium text-foreground/90 leading-relaxed mb-2 break-words">
                    "{pattern.content}"
                  </div>
                  <div className="text-[10px] font-mono text-muted-foreground uppercase">
                    <span className="opacity-40 mr-1">↑</span>
                    {pattern.source_channel}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
