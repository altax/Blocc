import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { FlaskConical, Zap, Brain, AlertCircle, RotateCcw, Loader2, Database, Hash, Users, TrendingUp, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Scenario { id: string; label: string; game_event: string; streamer_speech: string; map: string; situation: string }
interface TestResult { variants: string[]; patterns_used: string[]; context: { game_event: string; streamer_speech: string; map: string; situation: string }; tokens_used: number; model_used?: string; demo_mode?: boolean }
interface DatasetStats { total: number; by_channel: { channel: string; count: number }[]; by_type: { type: string; count: number }[]; top_patterns: { content: string; frequency: number; channel: string }[] }

const TYPE_COLORS: Record<string, string> = {
  ace_awp: "text-yellow-400 border-yellow-500/30 bg-yellow-500/8",
  clutch_1v3: "text-orange-400 border-orange-500/30 bg-orange-500/8",
  streamer_died_stupid: "text-red-400 border-red-500/30 bg-red-500/8",
  win_round_pistol: "text-emerald-400 border-emerald-500/30 bg-emerald-500/8",
  loss_eco: "text-red-400 border-red-500/30 bg-red-500/8",
  watching_pro: "text-blue-400 border-blue-500/30 bg-blue-500/8",
};

const PATTERN_TYPE_LABELS: Record<string, string> = {
  word: "слова", phrase: "фразы", emote: "эмоуты", reaction: "реакции", slang: "сленг",
};

export default function TestBot() {
  const [form, setForm] = useState({ game_event: "", streamer_speech: "", map: "", situation: "", count: 3 });
  const [lastResult, setLastResult] = useState<TestResult | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);

  const { data: scenarios } = useQuery<Scenario[]>({
    queryKey: ["test-scenarios"],
    queryFn: async () => { const r = await fetch("/api/bot/test-scenarios"); return r.json(); },
    staleTime: Infinity,
  });

  const { data: stats, isLoading: statsLoading } = useQuery<DatasetStats>({
    queryKey: ["dataset-stats"],
    queryFn: async () => { const r = await fetch("/api/patterns/dataset-stats"); return r.json(); },
    refetchInterval: 15000,
  });

  const testMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await fetch("/api/bot/test-message", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, scenario_id: selectedScenario ?? "" }) });
      if (!r.ok) { const e = await r.json(); throw new Error(e.error ?? "Ошибка генерации"); }
      return r.json() as Promise<TestResult>;
    },
    onSuccess: (data) => setLastResult(data),
  });

  const applyScenario = (s: Scenario) => {
    setSelectedScenario(s.id);
    setForm({ game_event: s.game_event, streamer_speech: s.streamer_speech, map: s.map, situation: s.situation, count: 3 });
  };

  const canGenerate = form.game_event.trim().length > 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <FlaskConical className="w-4.5 h-4.5 text-primary" />
            Тест ИИ
          </h1>
          <p className="text-xs text-muted-foreground/40 mt-0.5">Задай игровую ситуацию — посмотри что напишет бот</p>
        </div>
        {stats && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground/50 border border-white/6 rounded-lg px-3 py-1.5">
            <Database className="w-3 h-3" />
            <span className="font-mono font-semibold text-foreground/70">{stats.total.toLocaleString()}</span>
            <span>паттернов</span>
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden flex divide-x divide-white/5">
        {/* Left: Input form */}
        <div className="w-[440px] flex flex-col overflow-y-auto shrink-0">
          <div className="p-5 space-y-5">

            {/* Scenarios */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">Быстрые сценарии</p>
              <div className="grid grid-cols-2 gap-1.5">
                {scenarios?.map(s => (
                  <button
                    key={s.id}
                    onClick={() => applyScenario(s)}
                    className={cn(
                      "text-left px-3 py-2.5 rounded-lg border text-xs transition-all",
                      selectedScenario === s.id ? "border-primary/40 bg-primary/10" : "border-white/6 bg-white/2 hover:border-white/12 hover:bg-white/4",
                      TYPE_COLORS[s.id] ?? "border-white/6"
                    )}
                  >
                    <span className={cn("font-semibold block mb-0.5", selectedScenario === s.id ? "text-primary" : "text-foreground/80")}>{s.label}</span>
                    <span className="text-[10px] text-muted-foreground/40 block truncate">{s.map}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex-1 h-px bg-white/5" />
              <span className="text-[10px] text-muted-foreground/30">или вручную</span>
              <div className="flex-1 h-px bg-white/5" />
            </div>

            {/* Form fields */}
            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-foreground/70 flex items-center gap-1.5">
                <Zap className="w-3 h-3 text-yellow-400" />Что произошло в игре *
              </label>
              <Textarea
                placeholder="Например: стример сделал клатч 1v4 через смок на b-сайте..."
                className="min-h-[80px] text-xs resize-none bg-black/30 border-white/8 focus:border-primary/40"
                value={form.game_event}
                onChange={(e) => { setForm(f => ({ ...f, game_event: e.target.value })); setSelectedScenario(null); }}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground/50">Что сказал стример (необязательно)</label>
              <Textarea
                placeholder="Например: ВАУ! Это было нереально!..."
                className="min-h-[52px] text-xs resize-none bg-black/30 border-white/8 focus:border-primary/40"
                value={form.streamer_speech}
                onChange={(e) => { setForm(f => ({ ...f, streamer_speech: e.target.value })); setSelectedScenario(null); }}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-muted-foreground/50">Карта</label>
                <input
                  type="text" placeholder="de_mirage"
                  className="w-full px-3 py-2 rounded-lg border border-white/8 bg-black/30 text-xs focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground/30"
                  value={form.map}
                  onChange={(e) => setForm(f => ({ ...f, map: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-medium text-muted-foreground/50">Вариантов</label>
                <div className="flex gap-1">
                  {[1, 3, 5].map(n => (
                    <button
                      key={n}
                      onClick={() => setForm(f => ({ ...f, count: n }))}
                      className={cn(
                        "flex-1 py-2 rounded-lg border text-xs font-semibold font-mono transition-all",
                        form.count === n ? "border-primary/40 bg-primary/15 text-primary" : "border-white/8 bg-black/20 text-muted-foreground/50 hover:border-white/15"
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[12px] font-medium text-muted-foreground/50">Ситуация в матче</label>
              <input
                type="text" placeholder="Счёт 14-12, последний раунд..."
                className="w-full px-3 py-2 rounded-lg border border-white/8 bg-black/30 text-xs focus:outline-none focus:border-primary/40 text-foreground placeholder:text-muted-foreground/30"
                value={form.situation}
                onChange={(e) => setForm(f => ({ ...f, situation: e.target.value }))}
              />
            </div>

            <Button className="w-full h-10 font-semibold" disabled={!canGenerate || testMutation.isPending} onClick={() => testMutation.mutate(form)}>
              {testMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Генерирует...</> : <><Brain className="w-4 h-4 mr-2" />Сгенерировать</>}
            </Button>
          </div>
        </div>

        {/* Right: Results */}
        <div className="flex-1 flex flex-col overflow-y-auto">

          {testMutation.isError && !lastResult && (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3">
              <AlertCircle className="w-10 h-10 text-red-400/50" />
              <p className="text-sm font-medium text-red-400">Не удалось сгенерировать</p>
              <p className="text-xs text-muted-foreground/40 max-w-xs">{testMutation.error?.message}</p>
            </div>
          )}

          {testMutation.isPending && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-3">
                <div className="w-10 h-10 rounded-xl bg-primary/15 border border-primary/20 flex items-center justify-center mx-auto">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                </div>
                <p className="text-sm text-muted-foreground/50">ИИ думает...</p>
              </div>
            </div>
          )}

          {!lastResult && !testMutation.isPending && !testMutation.isError && (
            <div className="p-5 space-y-5">
              {/* Stats summary */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: "Паттернов всего", value: statsLoading ? "…" : (stats?.total ?? 0).toLocaleString() },
                  { label: "Каналов", value: statsLoading ? "…" : (stats?.by_channel.length ?? 0) },
                  { label: "Типов данных", value: statsLoading ? "…" : (stats?.by_type.length ?? 0) },
                ].map(m => (
                  <div key={m.label} className="rounded-xl border border-white/6 bg-white/2 p-3 text-center">
                    <div className="text-2xl font-bold font-mono text-primary">{m.value}</div>
                    <div className="text-[10px] text-muted-foreground/40 mt-0.5">{m.label}</div>
                  </div>
                ))}
              </div>

              {stats && stats.total === 0 && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-400/80">
                  База пустая. Запусти обучение на вкладке <strong>Обучение</strong> — соберись паттерны из реального чата русских CS2 стримеров.
                </div>
              )}

              {stats && stats.total > 0 && (
                <>
                  {/* By channel */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40 flex items-center gap-1.5"><Users className="w-3 h-3" />Каналы</p>
                    {stats.by_channel.map(ch => {
                      const pct = Math.round((ch.count / stats.total) * 100);
                      return (
                        <div key={ch.channel} className="flex items-center gap-2.5">
                          <div className="w-24 shrink-0 font-mono text-[11px] text-foreground/60 truncate">{ch.channel}</div>
                          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className="h-full bg-primary/50 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="w-10 text-right font-mono text-[10px] text-muted-foreground/35">{ch.count}</div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Top patterns */}
                  <div className="space-y-2">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40 flex items-center gap-1.5"><TrendingUp className="w-3 h-3" />Топ паттернов</p>
                    {stats.top_patterns.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg border border-white/5 bg-white/2 hover:border-white/10 transition-colors">
                        <span className="w-5 shrink-0 text-[10px] text-muted-foreground/25 text-right font-mono">{i + 1}</span>
                        <span className="flex-1 font-mono text-xs text-foreground/70">{p.content}</span>
                        <span className="text-[10px] font-mono text-muted-foreground/30 shrink-0">{p.channel}</span>
                        <span className="text-[10px] font-mono text-primary/60 shrink-0">×{p.frequency}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {lastResult && !testMutation.isPending && (
            <div className="p-5 space-y-5">
              {/* Context recap */}
              <div className="rounded-xl border border-white/6 bg-white/2 p-4 space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">Контекст</p>
                {lastResult.context.game_event && (
                  <div className="text-xs"><span className="text-yellow-400 font-medium">Событие: </span><span className="text-foreground/70">{lastResult.context.game_event}</span></div>
                )}
                {lastResult.context.streamer_speech && (
                  <div className="text-xs"><span className="text-blue-400 font-medium">Стример: </span><span className="text-foreground/70">"{lastResult.context.streamer_speech}"</span></div>
                )}
                {lastResult.context.map && <div className="text-[11px] text-muted-foreground/40">{lastResult.context.map}{lastResult.context.situation && ` · ${lastResult.context.situation}`}</div>}
              </div>

              {lastResult.demo_mode && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-400/80 flex items-start gap-2.5">
                  <FlaskConical className="w-4 h-4 shrink-0 mt-0.5" />
                  <div><strong>Demo Mode</strong> — шаблонные ответы, не от LLM. Добавь <strong>Gemini API</strong> ключ в Настройки — бесплатно на <a href="https://aistudio.google.com" target="_blank" rel="noopener" className="underline">aistudio.google.com</a></div>
                </div>
              )}

              {/* Generated variants */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">Что напишет бот</p>
                  <div className="flex items-center gap-2">
                    {lastResult.model_used && (
                      <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-mono border",
                        lastResult.demo_mode ? "bg-yellow-500/10 border-yellow-500/30 text-yellow-400" :
                        lastResult.model_used.includes("gemini") ? "bg-blue-500/10 border-blue-500/30 text-blue-400" :
                        "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                      )}>{lastResult.demo_mode ? "demo" : lastResult.model_used}</span>
                    )}
                    {!lastResult.demo_mode && <span className="text-[10px] text-muted-foreground/30 font-mono">{lastResult.tokens_used} токенов</span>}
                  </div>
                </div>
                <div className="space-y-2">
                  {lastResult.variants.map((v, i) => (
                    <div key={i} className="flex items-start gap-3 bg-primary/5 rounded-xl border border-primary/15 px-4 py-3 hover:border-primary/25 transition-colors">
                      <div className="w-6 h-6 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[10px] text-primary font-bold">{i + 1}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-1">
                        <Bot className="w-3 h-3 text-primary/40 shrink-0" />
                        <span className="font-mono text-[15px] text-foreground leading-relaxed">{v}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Patterns used */}
              {lastResult.patterns_used.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">Паттерны как стилевой ориентир</p>
                  <div className="flex flex-wrap gap-1.5">
                    {lastResult.patterns_used.map((p, i) => (
                      <span key={i} className="font-mono text-[11px] bg-white/4 border border-white/8 rounded-md px-2 py-0.5 text-muted-foreground/60">{p}</span>
                    ))}
                  </div>
                  <p className="text-[10px] text-muted-foreground/30">Бот не копирует — использует как ориентир по лексике и тону</p>
                </div>
              )}

              {lastResult.patterns_used.length === 0 && (
                <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 text-xs text-yellow-400/70">
                  Паттернов нет. Запусти запись IRC на вкладке Стримеры — накопи обучающие данные.
                </div>
              )}

              <Button variant="outline" size="sm" onClick={() => testMutation.mutate(form)} className="w-full border-white/8 hover:bg-white/5">
                <RotateCcw className="w-3.5 h-3.5 mr-1.5" />Другие варианты
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
