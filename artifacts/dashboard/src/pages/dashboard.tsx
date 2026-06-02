import { useQuery } from "@tanstack/react-query";
import {
  useGetBotStatus, useGetStats, useGetMessages,
  getGetBotStatusQueryKey, getGetStatsQueryKey, getGetMessagesQueryKey,
} from "@workspace/api-client-react";
import { cn } from "@/lib/utils";
import { formatUptime, formatRelativeTime } from "@/lib/format";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar,
  PolarGrid, PolarAngleAxis, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Activity, MessageSquareText, Hash, BrainCircuit, Sparkles,
  TrendingUp, Zap, RefreshCw, Star, Clock, Radio,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const API = "/api";

interface IntelligenceMetrics {
  total_messages: number; scored_messages: number;
  avg_quality: number | null; avg_quality_week: number | null;
  total_patterns: number; avg_pattern_quality: number | null;
  top_patterns: { content: string; qualityScore: number; frequency: number; patternType: string; effectivenessCount: number }[];
  total_reflections: number;
}
interface QualityPoint {
  id: number; message: string; qualityScore: number;
  triggerType: string; createdAt: string;
  qualityBreakdown: { naturalness: number; context_fit: number; style_match: number; brevity: number } | null;
}
interface DayStats { date: string; total: number; avg_quality: number | null }
interface DNA { naturalness: number; contextFit: number; styleMatch: number; brevity: number; overall: number; sampleSize: number }
interface Reflection {
  id: number; messagesAnalyzed: number; avgQualityBefore: number | null;
  critique: string; improvements: string; promptDelta: string | null;
  triggeredBy: string; createdAt: string;
}

function useIntelligence() {
  const metrics = useQuery<IntelligenceMetrics>({ queryKey: ["intelligence/metrics"], queryFn: () => fetch(`${API}/intelligence/metrics`).then(r => r.json()), refetchInterval: 15000 });
  const trend = useQuery<QualityPoint[]>({ queryKey: ["intelligence/quality-trend"], queryFn: () => fetch(`${API}/intelligence/quality-trend?limit=60`).then(r => r.json()), refetchInterval: 15000 });
  const dna = useQuery<DNA>({ queryKey: ["intelligence/dna"], queryFn: () => fetch(`${API}/intelligence/dna`).then(r => r.json()), refetchInterval: 20000 });
  const reflections = useQuery<Reflection[]>({ queryKey: ["intelligence/reflections"], queryFn: () => fetch(`${API}/intelligence/reflections?limit=5`).then(r => r.json()), refetchInterval: 30000 });
  const perDay = useQuery<DayStats[]>({ queryKey: ["intelligence/messages-per-day"], queryFn: () => fetch(`${API}/intelligence/messages-per-day`).then(r => r.json()), refetchInterval: 60000 });
  return { metrics, trend, dna, reflections, perDay };
}

function scoreColor(s: number | null | undefined) {
  if (s == null) return "text-muted-foreground";
  return s >= 80 ? "text-emerald-400" : s >= 60 ? "text-yellow-400" : s >= 40 ? "text-orange-400" : "text-red-400";
}
function scoreDotColor(s: number | null) {
  if (s == null) return "bg-muted-foreground/30";
  return s >= 80 ? "bg-emerald-400" : s >= 60 ? "bg-yellow-400" : s >= 40 ? "bg-orange-400" : "bg-red-400";
}

function MetricCard({ label, value, sub, icon: Icon, accent }: { label: string; value: React.ReactNode; sub?: string; icon: any; accent?: string }) {
  return (
    <div className="rounded-xl border border-white/6 bg-white/3 p-4 flex flex-col gap-3 hover:border-white/10 transition-colors">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider">{label}</span>
        <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center", accent ?? "bg-primary/15")}>
          <Icon className={cn("w-3.5 h-3.5", accent ? "text-white/70" : "text-primary/80")} />
        </div>
      </div>
      <div className="text-2xl font-bold font-mono tracking-tight leading-none">{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground/50">{sub}</div>}
    </div>
  );
}

function QualityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as QualityPoint;
  return (
    <div className="bg-[#0d0d14] border border-white/10 rounded-lg p-3 text-xs shadow-xl max-w-[200px]">
      <div className="flex items-center gap-2 mb-1.5">
        <span className={cn("w-2 h-2 rounded-full", scoreDotColor(d.qualityScore))} />
        <span className="font-bold text-sm font-mono">{d.qualityScore}</span>
        <span className="text-muted-foreground">/ 100</span>
      </div>
      <p className="text-foreground/70 italic">"{d.message?.slice(0, 60)}{(d.message?.length ?? 0) > 60 ? "…" : ""}"</p>
    </div>
  );
}

function DayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayStats;
  return (
    <div className="bg-[#0d0d14] border border-white/10 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold mb-1">{label}</p>
      <p>Сообщений: <span className="font-bold text-primary">{d.total}</span></p>
      {d.avg_quality != null && <p>Качество: <span className="font-bold">{d.avg_quality}</span></p>}
    </div>
  );
}

export default function Dashboard() {
  const { data: status } = useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey(), refetchInterval: 3000 } });
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey(), refetchInterval: 5000 } });
  const { data: messages } = useGetMessages({ limit: 8 }, { query: { queryKey: getGetMessagesQueryKey({ limit: 8 }), refetchInterval: 4000 } });
  const { metrics, trend, dna, reflections, perDay } = useIntelligence();

  const [reflecting, setReflecting] = useState(false);

  const handleReflect = async () => {
    setReflecting(true);
    try {
      await fetch(`${API}/intelligence/reflect`, { method: "POST" });
      reflections.refetch();
      metrics.refetch();
    } finally { setReflecting(false); }
  };

  const isRunning = status?.running ?? false;
  const avgQ = metrics.data?.avg_quality;
  const qualityTrend = avgQ != null && metrics.data?.avg_quality_week != null ? avgQ - metrics.data.avg_quality_week : null;

  const trendData = (trend.data ?? []).map((p, i) => ({ ...p, index: i + 1 }));
  const dayData = (perDay.data ?? []).map(d => ({
    ...d,
    dateShort: d.date ? new Date(d.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "",
  }));
  const dnaData = dna.data ? [
    { trait: "Естественность", value: dna.data.naturalness },
    { trait: "Контекст", value: dna.data.contextFit },
    { trait: "CS2-стиль", value: dna.data.styleMatch },
    { trait: "Краткость", value: dna.data.brevity },
  ] : [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">

      {/* Header */}
      <div className="px-6 py-5 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2.5">
            <BrainCircuit className="w-5 h-5 text-primary" />
            Командный центр
          </h1>
          <p className="text-xs text-muted-foreground/50 mt-0.5">Производительность ИИ, качество сообщений, обучение</p>
        </div>
        <div className={cn(
          "flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border font-medium",
          isRunning ? "text-emerald-400 border-emerald-500/25 bg-emerald-500/8" : "text-muted-foreground/40 border-white/6"
        )}>
          <span className={cn("w-1.5 h-1.5 rounded-full", isRunning ? "bg-emerald-400 animate-pulse" : "bg-white/20")} />
          {isRunning ? `Watching #${status?.channel}` : "Offline"}
          {isRunning && status?.uptime_seconds ? (
            <span className="text-muted-foreground/50 font-mono text-[10px] ml-1">{formatUptime(status.uptime_seconds)}</span>
          ) : null}
        </div>
      </div>

      <div className="p-6 space-y-5 max-w-[1400px] mx-auto w-full">

        {/* Metrics row */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <MetricCard
            label="Качество"
            icon={Sparkles}
            value={metrics.isLoading ? <Skeleton className="h-7 w-14 bg-white/5" /> :
              <span className={cn("font-mono", scoreColor(avgQ))}>
                {avgQ != null ? avgQ : "—"}
                {qualityTrend != null && (
                  <span className={cn("text-sm ml-1.5", qualityTrend >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {qualityTrend >= 0 ? "+" : ""}{qualityTrend.toFixed(1)}
                  </span>
                )}
              </span>
            }
            sub="Средний балл"
          />
          <MetricCard
            label="Сегодня"
            icon={MessageSquareText}
            value={!stats ? <Skeleton className="h-7 w-10 bg-white/5" /> : <span className="text-primary">{stats.messages_today || 0}</span>}
            sub="Сообщений отправлено"
          />
          <MetricCard
            label="Паттерны"
            icon={Hash}
            value={metrics.isLoading ? <Skeleton className="h-7 w-12 bg-white/5" /> : metrics.data?.total_patterns ?? stats?.total_patterns_learned ?? 0}
            sub={`Качество: ${metrics.data?.avg_pattern_quality ?? "—"}`}
          />
          <MetricCard
            label="Рефлексии"
            icon={BrainCircuit}
            value={metrics.isLoading ? <Skeleton className="h-7 w-8 bg-white/5" /> : metrics.data?.total_reflections ?? 0}
            sub="Самоанализ ИИ"
          />
          <MetricCard
            label="Аптайм"
            icon={Clock}
            value={<span className="text-primary font-mono">{formatUptime(status?.uptime_seconds || 0)}</span>}
            sub="Текущая сессия"
          />
        </div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Quality trend */}
          <div className="lg:col-span-2 rounded-xl border border-white/6 bg-white/2 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Качество сообщений</span>
              </div>
              <span className="text-[11px] text-muted-foreground/40 font-mono">
                {metrics.data?.scored_messages ?? 0} / {metrics.data?.total_messages ?? 0}
              </span>
            </div>
            <div className="p-5">
              {trendData.length === 0 ? (
                <div className="h-[200px] flex flex-col items-center justify-center text-center gap-2">
                  <Sparkles className="w-8 h-8 opacity-15" />
                  <p className="text-sm text-muted-foreground/50">Оценки появятся после первых сообщений</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={trendData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                    <XAxis dataKey="index" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<QualityTooltip />} />
                    <ReferenceLine y={80} stroke="#34d399" strokeDasharray="4 4" opacity={0.3} />
                    <ReferenceLine y={60} stroke="#fbbf24" strokeDasharray="4 4" opacity={0.25} />
                    <Line
                      type="monotone" dataKey="qualityScore"
                      stroke="hsl(var(--primary))" strokeWidth={2}
                      dot={(props) => {
                        const s = props.payload?.qualityScore as number;
                        const c = s >= 80 ? "#34d399" : s >= 60 ? "#fbbf24" : "#f97316";
                        return <circle key={props.key} cx={props.cx} cy={props.cy} r={2.5} fill={c} stroke="none" />;
                      }}
                      activeDot={{ r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* DNA Radar */}
          <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">ДНК личности</span>
              </div>
              {dna.data?.sampleSize != null && (
                <span className="text-[11px] text-muted-foreground/40 font-mono">{dna.data.sampleSize} сообщ.</span>
              )}
            </div>
            <div className="p-4">
              {!dna.data || dna.data.sampleSize === 0 ? (
                <div className="h-[180px] flex flex-col items-center justify-center text-center gap-2">
                  <BrainCircuit className="w-8 h-8 opacity-15" />
                  <p className="text-xs text-muted-foreground/40">ДНК формируется из оценок</p>
                </div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={175}>
                    <RadarChart data={dnaData} margin={{ top: 8, right: 18, bottom: 8, left: 18 }}>
                      <PolarGrid stroke="rgba(255,255,255,0.06)" />
                      <PolarAngleAxis dataKey="trait" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.35)" }} />
                      <Radar dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.15} strokeWidth={1.5} />
                    </RadarChart>
                  </ResponsiveContainer>
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2">
                    {dnaData.map(d => (
                      <div key={d.trait} className="flex items-center justify-between text-[11px]">
                        <span className="text-muted-foreground/50">{d.trait}</span>
                        <span className={cn("font-mono font-bold", scoreColor(d.value))}>{d.value}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Bottom grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

          {/* Messages bar chart */}
          <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5">
              <Activity className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">По дням</span>
            </div>
            <div className="p-5">
              {dayData.length === 0 ? (
                <div className="h-[140px] flex items-center justify-center text-xs text-muted-foreground/30">Нет данных за 14 дней</div>
              ) : (
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={dayData} margin={{ top: 5, right: 0, bottom: 0, left: -28 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="dateShort" tick={{ fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "rgba(255,255,255,0.25)" }} tickLine={false} axisLine={false} />
                    <Tooltip content={<DayTooltip />} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" fillOpacity={0.7} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Top patterns */}
          <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5">
              <Star className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold">Топ паттерны</span>
            </div>
            <div>
              {metrics.isLoading ? (
                <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 bg-white/4" />)}</div>
              ) : (metrics.data?.top_patterns ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center text-xs text-muted-foreground/30">Запусти обучение на стримерах</div>
              ) : (
                <div>
                  {(metrics.data?.top_patterns ?? []).slice(0, 7).map((p, i) => (
                    <div key={i} className="flex items-center gap-2.5 px-5 py-2.5 border-b border-white/4 last:border-0 hover:bg-white/3 transition-colors">
                      <span className="text-[10px] text-muted-foreground/30 font-mono w-4 shrink-0">{i + 1}</span>
                      <span className="text-xs font-mono flex-1 truncate text-foreground/80">{p.content}</span>
                      <span className="text-[10px] text-muted-foreground/40 shrink-0">×{p.frequency}</span>
                      <span className={cn("text-[11px] font-mono font-bold shrink-0", scoreColor(Math.round(p.qualityScore)))}>{Math.round(p.qualityScore)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Reflections */}
          <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-white/5">
              <div className="flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold">Рефлексии</span>
              </div>
              <Button size="sm" variant="outline" className="h-6 text-[11px] px-2.5 border-white/10 bg-transparent hover:bg-white/5" onClick={handleReflect} disabled={reflecting}>
                {reflecting ? <RefreshCw className="w-3 h-3 animate-spin mr-1" /> : <Zap className="w-3 h-3 mr-1" />}
                {reflecting ? "…" : "Запустить"}
              </Button>
            </div>
            <div className="overflow-auto" style={{ maxHeight: 220 }}>
              {reflections.isLoading ? (
                <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 bg-white/4" />)}</div>
              ) : (reflections.data ?? []).length === 0 ? (
                <div className="px-5 py-10 text-center">
                  <p className="text-xs text-muted-foreground/30">Нет рефлексий</p>
                  <p className="text-[11px] text-muted-foreground/20 mt-1">Автоматически каждые 20 сообщений</p>
                </div>
              ) : (
                <div>
                  {(reflections.data ?? []).map(r => (
                    <div key={r.id} className="px-5 py-3 border-b border-white/4 last:border-0 hover:bg-white/3 transition-colors">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className={cn("text-[10px] px-1.5 py-0.5 rounded font-medium border", r.triggeredBy === "manual" ? "border-primary/30 text-primary bg-primary/8" : "border-white/8 text-muted-foreground/40")}>
                          {r.triggeredBy === "manual" ? "ручная" : "авто"}
                        </span>
                        <span className="text-[10px] text-muted-foreground/30 font-mono">{formatRelativeTime(r.createdAt)}</span>
                      </div>
                      <p className="text-xs text-foreground/60 line-clamp-2 leading-relaxed">{r.critique}</p>
                      {r.promptDelta && <p className="text-[11px] text-primary/60 mt-1 italic line-clamp-1">→ {r.promptDelta}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Recent messages feed */}
        <div className="rounded-xl border border-white/6 bg-white/2 overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3.5 border-b border-white/5">
            <Radio className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-semibold">Последние сообщения бота</span>
            {isRunning && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-1" />}
          </div>
          <div className="divide-y divide-white/4">
            {!messages || messages.length === 0 ? (
              <div className="px-5 py-8 text-center text-xs text-muted-foreground/30">
                Бот ещё не отправил ни одного сообщения
              </div>
            ) : (
              messages.slice(0, 6).map(msg => (
                <div key={msg.id} className="flex items-start gap-4 px-5 py-3 hover:bg-white/2 transition-colors">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono text-foreground/85">"{msg.message}"</span>
                    {msg.context_summary && (
                      <p className="text-[11px] text-muted-foreground/35 mt-0.5 line-clamp-1">{msg.context_summary}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <span className="text-[10px] font-mono text-muted-foreground/25 border border-white/6 rounded px-1.5 py-0.5">{msg.channel}</span>
                    <span className="text-[10px] text-muted-foreground/25 font-mono">{formatRelativeTime(msg.created_at)}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
