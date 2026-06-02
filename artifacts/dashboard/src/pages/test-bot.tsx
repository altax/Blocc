import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { FlaskConical, Zap, Brain, AlertCircle, RotateCcw, Loader2, Database, Hash, Users, TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Scenario {
  id: string;
  label: string;
  game_event: string;
  streamer_speech: string;
  map: string;
  situation: string;
}

interface TestResult {
  variants: string[];
  patterns_used: string[];
  context: { game_event: string; streamer_speech: string; map: string; situation: string };
  tokens_used: number;
  model_used?: string;
  demo_mode?: boolean;
}

interface DatasetStats {
  total: number;
  by_channel: { channel: string; count: number }[];
  by_type: { type: string; count: number }[];
  top_patterns: { content: string; frequency: number; channel: string }[];
}

const TYPE_COLORS: Record<string, string> = {
  ace_awp: "text-yellow-400",
  clutch_1v3: "text-orange-400",
  streamer_died_stupid: "text-red-400",
  win_round_pistol: "text-green-400",
  loss_eco: "text-red-400",
  watching_pro: "text-blue-400",
};

const PATTERN_TYPE_LABELS: Record<string, string> = {
  word: "слова",
  phrase: "фразы",
  emote: "эмоуты",
  reaction: "реакции",
  slang: "сленг",
};

export default function TestBot() {
  const [form, setForm] = useState({
    game_event: "",
    streamer_speech: "",
    map: "",
    situation: "",
    count: 3,
  });
  const [lastResult, setLastResult] = useState<TestResult | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["test-scenarios"],
    queryFn: async () => {
      const r = await fetch("/api/bot/test-scenarios");
      return r.json();
    },
    staleTime: Infinity,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DatasetStats>({
    queryKey: ["dataset-stats"],
    queryFn: async () => {
      const r = await fetch("/api/patterns/dataset-stats");
      return r.json();
    },
    refetchInterval: 15_000,
  });

  const testMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch("/api/bot/test-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, scenario_id: selectedScenario ?? "" }),
      });
      if (!r.ok) {
        const e = await r.json();
        throw new Error(e.error ?? "Ошибка генерации");
      }
      return r.json() as Promise<TestResult>;
    },
    onSuccess: (data) => setLastResult(data),
  });

  const applyScenario = (s: Scenario) => {
    setSelectedScenario(s.id);
    setForm({
      game_event: s.game_event,
      streamer_speech: s.streamer_speech,
      map: s.map,
      situation: s.situation,
      count: 3,
    });
  };

  const canGenerate = form.game_event.trim().length > 0;

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Header */}
      <header className="h-14 border-b border-border/50 flex items-center px-6 gap-3 shrink-0 bg-card/30">
        <FlaskConical className="w-5 h-5 text-primary" />
        <div>
          <h1 className="text-sm font-semibold">Тест ИИ</h1>
          <p className="text-xs text-muted-foreground">
            Задай игровую ситуацию — посмотри что напишет бот
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          {stats && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Database className="w-3.5 h-3.5" />
              <span className="font-mono text-foreground font-medium">{stats.total.toLocaleString()}</span>
              <span>паттернов в базе</span>
            </div>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-hidden flex gap-0 divide-x divide-border/50">
        {/* Left: Input form */}
        <div className="w-[460px] flex flex-col overflow-y-auto shrink-0">
          <div className="p-5 space-y-5">

            {/* Пресет-сценарии */}
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Быстрые сценарии
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {scenarios?.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => applyScenario(s)}
                    className={cn(
                      "text-left px-3 py-2 rounded-lg border text-xs transition-all",
                      selectedScenario === s.id
                        ? "border-primary/50 bg-primary/10 text-primary"
                        : "border-border/50 bg-card/50 hover:border-border hover:bg-card/80 text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <span className={cn("font-medium", TYPE_COLORS[s.id] ?? "text-foreground")}>
                      {s.label}
                    </span>
                    <div className="text-[10px] mt-0.5 text-muted-foreground line-clamp-1">
                      {s.map}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-xs text-muted-foreground">или свой сценарий</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>

            {/* Что произошло — главное поле */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-yellow-400" />
                Что произошло в игре *
              </label>
              <Textarea
                placeholder="Например: стример сделал клатч 1v4 через смок на b-сайте..."
                className="min-h-[80px] text-xs resize-none bg-card/50"
                value={form.game_event}
                onChange={(e) => {
                  setForm((f) => ({ ...f, game_event: e.target.value }));
                  setSelectedScenario(null);
                }}
              />
            </div>

            {/* Что сказал стример */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Что сказал стример (необязательно)
              </label>
              <Textarea
                placeholder="Например: ВАУ! Это было нереально! Я сам не верю..."
                className="min-h-[60px] text-xs resize-none bg-card/50"
                value={form.streamer_speech}
                onChange={(e) => {
                  setForm((f) => ({ ...f, streamer_speech: e.target.value }));
                  setSelectedScenario(null);
                }}
              />
            </div>

            {/* Карта + ситуация */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Карта</label>
                <input
                  type="text"
                  placeholder="de_mirage"
                  className="w-full px-3 py-2 rounded-md border border-border/50 bg-card/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                  value={form.map}
                  onChange={(e) => setForm((f) => ({ ...f, map: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Вариантов</label>
                <div className="flex gap-1">
                  {[1, 3, 5].map((n) => (
                    <button
                      key={n}
                      onClick={() => setForm((f) => ({ ...f, count: n }))}
                      className={cn(
                        "flex-1 py-2 rounded-md border text-xs font-medium transition-colors",
                        form.count === n
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border/50 bg-card/50 text-muted-foreground hover:border-border"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Ситуация в матче</label>
              <input
                type="text"
                placeholder="Например: счёт 14-12, последний раунд..."
                className="w-full px-3 py-2 rounded-md border border-border/50 bg-card/50 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                value={form.situation}
                onChange={(e) => setForm((f) => ({ ...f, situation: e.target.value }))}
              />
            </div>

            {/* Generate button */}
            <Button
              className="w-full"
              disabled={!canGenerate || testMutation.isPending}
              onClick={() => testMutation.mutate(form)}
            >
              {testMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Генерирует...
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4 mr-2" />
                  Сгенерировать
                </>
              )}
            </Button>

          </div>
        </div>

        {/* Right: Results / Dataset info */}
        <div className="flex-1 flex flex-col overflow-y-auto">

          {/* Error state */}
          {!lastResult && !testMutation.isPending && testMutation.isError && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
              <AlertCircle className="w-10 h-10 mb-3 text-destructive/60" />
              <div className="text-sm font-medium text-destructive mb-1">Не удалось сгенерировать</div>
              <div className="text-xs text-muted-foreground max-w-sm leading-relaxed">
                {testMutation.error?.message ?? "Неизвестная ошибка"}
              </div>
            </div>
          )}

          {/* Loading */}
          {testMutation.isPending && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto" />
                <div className="text-sm text-muted-foreground">Генерирует ответ...</div>
              </div>
            </div>
          )}

          {/* Empty state → Dataset stats */}
          {!lastResult && !testMutation.isPending && !testMutation.isError && (
            <div className="p-5 space-y-5">
              {/* Summary bar */}
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <div className="text-xl font-bold font-mono text-primary">
                    {statsLoading ? "…" : (stats?.total ?? 0).toLocaleString()}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">паттернов всего</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <div className="text-xl font-bold font-mono text-primary">
                    {statsLoading ? "…" : (stats?.by_channel.length ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">каналов</div>
                </div>
                <div className="rounded-lg border border-border/50 bg-card/40 p-3 text-center">
                  <div className="text-xl font-bold font-mono text-primary">
                    {statsLoading ? "…" : (stats?.by_type.length ?? 0)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">типов данных</div>
                </div>
              </div>

              {stats && stats.total === 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                  База пустая. Запусти обучение на вкладке <strong>Обучение</strong> — собери паттерны из реального чата русских CS2 стримеров.
                </div>
              )}

              {stats && stats.total > 0 && (
                <>
                  {/* By channel */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <Users className="w-3 h-3" />
                      Источники (каналы)
                    </div>
                    <div className="space-y-1">
                      {stats.by_channel.map((ch) => {
                        const pct = Math.round((ch.count / stats.total) * 100);
                        return (
                          <div key={ch.channel} className="flex items-center gap-2">
                            <div className="w-24 shrink-0 font-mono text-[11px] text-foreground truncate">{ch.channel}</div>
                            <div className="flex-1 h-1.5 bg-muted/40 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-primary/60 rounded-full"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <div className="w-12 text-right font-mono text-[10px] text-muted-foreground">{ch.count.toLocaleString()}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* By type */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <Hash className="w-3 h-3" />
                      Типы паттернов
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {stats.by_type.map((t) => (
                        <span
                          key={t.type}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-border/50 bg-card/50 text-[11px] text-muted-foreground"
                        >
                          <span className="text-foreground font-medium">{PATTERN_TYPE_LABELS[t.type] ?? t.type}</span>
                          <span className="font-mono">{t.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Top patterns */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                      <TrendingUp className="w-3 h-3" />
                      Топ паттернов (по частоте)
                    </div>
                    <div className="space-y-1">
                      {stats.top_patterns.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-card/40 border border-border/30 hover:border-border/60 transition-colors"
                        >
                          <span className="w-5 shrink-0 text-[10px] text-muted-foreground/60 text-right font-mono">{i + 1}</span>
                          <span className="flex-1 font-mono text-xs text-foreground">{p.content}</span>
                          <span className="text-[10px] font-mono text-muted-foreground shrink-0">{p.channel}</span>
                          <span className="text-[10px] font-mono text-primary shrink-0">×{p.frequency}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Results */}
          {lastResult && !testMutation.isPending && (
            <div className="p-5 space-y-6">
              {/* Context recap */}
              <div className="rounded-lg border border-border/50 bg-card/30 p-4 space-y-2">
                <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Входной контекст
                </div>
                {lastResult.context.game_event && (
                  <div className="text-xs">
                    <span className="text-yellow-400 font-medium">Событие: </span>
                    <span className="text-foreground/80">{lastResult.context.game_event}</span>
                  </div>
                )}
                {lastResult.context.streamer_speech && (
                  <div className="text-xs">
                    <span className="text-blue-400 font-medium">Стример: </span>
                    <span className="text-foreground/80">"{lastResult.context.streamer_speech}"</span>
                  </div>
                )}
                {lastResult.context.map && (
                  <div className="text-xs text-muted-foreground">
                    Карта: {lastResult.context.map}
                    {lastResult.context.situation && ` · ${lastResult.context.situation}`}
                  </div>
                )}
              </div>

              {/* Demo Mode banner */}
              {lastResult.demo_mode && (
                <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs text-yellow-400 flex items-start gap-2">
                  <FlaskConical className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Demo Mode</span> — ответы из шаблонов, не от LLM.
                    Чтобы увидеть реальный ИИ: добавь <strong>Gemini API</strong> ключ в Settings (бесплатно на <a href="https://aistudio.google.com" target="_blank" rel="noopener" className="underline underline-offset-2">aistudio.google.com</a>).
                  </div>
                </div>
              )}

              {/* Generated variants */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Что напишет бот
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    {lastResult.model_used && (
                      <span className={cn(
                        "px-1.5 py-0.5 rounded font-mono border",
                        lastResult.demo_mode
                          ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
                          : lastResult.model_used.includes("gemini")
                          ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                          : "bg-green-500/10 border-green-500/30 text-green-400"
                      )}>
                        {lastResult.demo_mode ? "demo" : lastResult.model_used}
                      </span>
                    )}
                    {!lastResult.demo_mode && <span>{lastResult.tokens_used} токенов</span>}
                  </div>
                </div>
                <div className="space-y-2">
                  {lastResult.variants.map((v, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-3 bg-card/50 rounded-lg border border-border/50 px-4 py-3 hover:border-primary/30 transition-colors"
                    >
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] text-primary font-semibold">{i + 1}</span>
                      </div>
                      <span className="font-mono text-sm text-foreground leading-relaxed">{v}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Patterns used as style reference */}
              {lastResult.patterns_used.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                    Паттерны как стилевой ориентир
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {lastResult.patterns_used.map((p, i) => (
                      <span
                        key={i}
                        className="font-mono text-[11px] bg-muted/40 border border-border/50 rounded px-2 py-0.5 text-muted-foreground"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Бот НЕ копирует эти фразы — использует их только как ориентир по лексике и тону
                  </div>
                </div>
              )}

              {lastResult.patterns_used.length === 0 && (
                <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-400">
                  Паттернов в базе ещё нет. Запусти запись IRC сессии на вкладке Стримеры чтобы накопить обучающие данные.
                </div>
              )}

              {/* Regenerate */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => testMutation.mutate(form)}
                className="w-full"
              >
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                Другие варианты
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
