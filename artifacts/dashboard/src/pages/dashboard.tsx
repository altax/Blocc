import { useQuery } from "@tanstack/react-query";
import { useGetBotStatus, useGetStats, useGetLogs, useGetMessages, getGetBotStatusQueryKey, getGetStatsQueryKey, getGetLogsQueryKey, getGetMessagesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatUptime, formatRelativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  LineChart, Line, BarChart, Bar, RadarChart, Radar, PolarGrid, PolarAngleAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import {
  Activity, MessageSquareText, Hash, BrainCircuit, Sparkles, TrendingUp,
  Eye, Mic, TerminalSquare, Zap, RefreshCw, ChevronRight, Star,
} from "lucide-react";
import { useState } from "react";

const API = "/api";

interface IntelligenceMetrics {
  total_messages: number;
  scored_messages: number;
  avg_quality: number | null;
  avg_quality_week: number | null;
  total_patterns: number;
  avg_pattern_quality: number | null;
  top_patterns: { content: string; qualityScore: number; frequency: number; patternType: string; effectivenessCount: number }[];
  worst_patterns: { content: string; qualityScore: number; frequency: number }[];
  total_reflections: number;
}

interface QualityPoint {
  id: number;
  message: string;
  qualityScore: number;
  triggerType: string;
  createdAt: string;
  qualityBreakdown: { naturalness: number; context_fit: number; style_match: number; brevity: number } | null;
}

interface DayStats {
  date: string;
  total: number;
  avg_quality: number | null;
}

interface DNA {
  naturalness: number;
  contextFit: number;
  styleMatch: number;
  brevity: number;
  overall: number;
  sampleSize: number;
}

interface Reflection {
  id: number;
  messagesAnalyzed: number;
  avgQualityBefore: number | null;
  critique: string;
  improvements: string;
  promptDelta: string | null;
  triggeredBy: string;
  createdAt: string;
}

function useIntelligence() {
  const metrics = useQuery<IntelligenceMetrics>({
    queryKey: ["intelligence/metrics"],
    queryFn: () => fetch(`${API}/intelligence/metrics`).then((r) => r.json()),
    refetchInterval: 15000,
  });
  const trend = useQuery<QualityPoint[]>({
    queryKey: ["intelligence/quality-trend"],
    queryFn: () => fetch(`${API}/intelligence/quality-trend?limit=60`).then((r) => r.json()),
    refetchInterval: 15000,
  });
  const dna = useQuery<DNA>({
    queryKey: ["intelligence/dna"],
    queryFn: () => fetch(`${API}/intelligence/dna`).then((r) => r.json()),
    refetchInterval: 20000,
  });
  const reflections = useQuery<Reflection[]>({
    queryKey: ["intelligence/reflections"],
    queryFn: () => fetch(`${API}/intelligence/reflections?limit=5`).then((r) => r.json()),
    refetchInterval: 30000,
  });
  const perDay = useQuery<DayStats[]>({
    queryKey: ["intelligence/messages-per-day"],
    queryFn: () => fetch(`${API}/intelligence/messages-per-day`).then((r) => r.json()),
    refetchInterval: 60000,
  });
  return { metrics, trend, dna, reflections, perDay };
}

function QualityBadge({ score }: { score: number | null | undefined }) {
  if (score == null) return <span className="text-muted-foreground text-xs">—</span>;
  const color =
    score >= 80 ? "text-emerald-400" :
    score >= 60 ? "text-yellow-400" :
    score >= 40 ? "text-orange-400" : "text-red-400";
  return <span className={cn("font-mono font-bold text-sm", color)}>{score}</span>;
}

function ScoreDot({ score }: { score: number | null }) {
  if (score == null) return <span className="w-2 h-2 rounded-full bg-muted inline-block" />;
  const color =
    score >= 80 ? "bg-emerald-400" :
    score >= 60 ? "bg-yellow-400" :
    score >= 40 ? "bg-orange-400" : "bg-red-400";
  return <span className={cn("w-2 h-2 rounded-full inline-block", color)} />;
}

function LogTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "vision": return <Eye className="w-3 h-3" />;
    case "speech": return <Mic className="w-3 h-3" />;
    case "decision": return <BrainCircuit className="w-3 h-3 text-primary" />;
    case "message_sent": return <MessageSquareText className="w-3 h-3 text-green-500" />;
    case "error": return <Activity className="w-3 h-3 text-destructive" />;
    default: return <TerminalSquare className="w-3 h-3" />;
  }
}

const CHART_COLORS = {
  primary: "hsl(var(--primary))",
  muted: "hsl(var(--muted-foreground))",
  emerald: "#34d399",
  yellow: "#fbbf24",
  orange: "#f97316",
};

function CustomQualityTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as QualityPoint;
  return (
    <div className="bg-card border border-border/60 rounded-lg p-3 text-xs shadow-xl max-w-[200px]">
      <div className="flex items-center gap-2 mb-1">
        <ScoreDot score={d.qualityScore} />
        <span className="font-bold text-sm">{d.qualityScore}</span>
        <span className="text-muted-foreground">/ 100</span>
      </div>
      <p className="text-foreground italic mb-1">"{d.message?.slice(0, 60)}{(d.message?.length ?? 0) > 60 ? "…" : ""}"</p>
      <span className="text-muted-foreground">{d.triggerType}</span>
    </div>
  );
}

function CustomDayTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload as DayStats;
  return (
    <div className="bg-card border border-border/60 rounded-lg p-3 text-xs shadow-xl">
      <p className="font-semibold mb-1">{label}</p>
      <p>Сообщений: <span className="font-bold">{d.total}</span></p>
      {d.avg_quality != null && <p>Ср. качество: <span className="font-bold">{d.avg_quality}</span></p>}
    </div>
  );
}

export default function Dashboard() {
  const { data: status } = useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey(), refetchInterval: 3000 } });
  const { data: stats } = useGetStats({ query: { queryKey: getGetStatsQueryKey(), refetchInterval: 5000 } });
  const { data: logs } = useGetLogs({ limit: 8 }, { query: { queryKey: getGetLogsQueryKey({ limit: 8 }), refetchInterval: 3000 } });
  const { data: messages } = useGetMessages({ limit: 6 }, { query: { queryKey: getGetMessagesQueryKey({ limit: 6 }), refetchInterval: 5000 } });

  const { metrics, trend, dna, reflections, perDay } = useIntelligence();

  const [reflecting, setReflecting] = useState(false);

  const handleReflect = async () => {
    setReflecting(true);
    try {
      await fetch(`${API}/intelligence/reflect`, { method: "POST" });
      reflections.refetch();
      metrics.refetch();
    } finally {
      setReflecting(false);
    }
  };

  const dnaData = dna.data ? [
    { trait: "Естественность", value: dna.data.naturalness, fullMark: 100 },
    { trait: "Контекст", value: dna.data.contextFit, fullMark: 100 },
    { trait: "CS2-стиль", value: dna.data.styleMatch, fullMark: 100 },
    { trait: "Краткость", value: dna.data.brevity, fullMark: 100 },
  ] : [];

  const trendData = (trend.data ?? []).map((p, i) => ({
    ...p,
    index: i + 1,
    label: `#${i + 1}`,
  }));

  const dayData = (perDay.data ?? []).map((d) => ({
    ...d,
    dateShort: d.date ? new Date(d.date).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }) : "",
  }));

  const avgQuality = metrics.data?.avg_quality;
  const qualityTrend =
    metrics.data?.avg_quality != null && metrics.data?.avg_quality_week != null
      ? metrics.data.avg_quality - metrics.data.avg_quality_week
      : null;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto w-full">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-primary" />
            Intelligence Center
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Метрики обучения, качество сообщений и ДНК личности бота</p>
        </div>
        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium",
            status?.running
              ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
              : "text-muted-foreground border-border"
          )}>
            <span className={cn("w-1.5 h-1.5 rounded-full", status?.running ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground")} />
            {status?.running ? `#${status.channel}` : "Offline"}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Качество</span>
              <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
            </div>
            {metrics.isLoading ? <Skeleton className="h-7 w-16" /> : (
              <div className="flex items-end gap-1.5">
                <QualityBadge score={avgQuality} />
                {qualityTrend != null && (
                  <span className={cn("text-xs mb-0.5", qualityTrend >= 0 ? "text-emerald-400" : "text-red-400")}>
                    {qualityTrend >= 0 ? "+" : ""}{qualityTrend.toFixed(1)}
                  </span>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Ср. оценка</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Сообщений</span>
              <MessageSquareText className="w-3.5 h-3.5 text-primary" />
            </div>
            {!stats ? <Skeleton className="h-7 w-12" /> : (
              <div className="text-2xl font-bold font-mono">{stats.messages_today || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Сегодня</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Паттерны</span>
              <Hash className="w-3.5 h-3.5 text-primary" />
            </div>
            {metrics.isLoading ? <Skeleton className="h-7 w-14" /> : (
              <div className="text-2xl font-bold font-mono">{metrics.data?.total_patterns || stats?.total_patterns_learned || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">
              Качество: {metrics.data?.avg_pattern_quality ?? "—"}
            </p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Рефлексий</span>
              <BrainCircuit className="w-3.5 h-3.5 text-primary" />
            </div>
            {metrics.isLoading ? <Skeleton className="h-7 w-10" /> : (
              <div className="text-2xl font-bold font-mono">{metrics.data?.total_reflections ?? 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-0.5">Самоанализ</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-muted-foreground">Аптайм</span>
              <Activity className="w-3.5 h-3.5 text-primary" />
            </div>
            <div className="text-2xl font-bold font-mono text-primary">{formatUptime(status?.uptime_seconds || 0)}</div>
            <p className="text-xs text-muted-foreground mt-0.5">Текущая сессия</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 bg-card/50 border-border/50">
          <CardHeader className="pb-2 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                Качество сообщений
              </CardTitle>
              <span className="text-xs text-muted-foreground">
                {metrics.data?.scored_messages ?? 0} оценено из {metrics.data?.total_messages ?? 0}
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            {trendData.length === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground">
                <div className="text-center">
                  <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>Оценки появятся после первых сообщений бота</p>
                  <p className="text-xs mt-1">Бот сам оценивает каждое своё сообщение</p>
                </div>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trendData} margin={{ top: 5, right: 10, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.4} />
                  <XAxis dataKey="index" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomQualityTooltip />} />
                  <ReferenceLine y={80} stroke={CHART_COLORS.emerald} strokeDasharray="4 4" opacity={0.5} />
                  <ReferenceLine y={60} stroke={CHART_COLORS.yellow} strokeDasharray="4 4" opacity={0.4} />
                  <Line
                    type="monotone"
                    dataKey="qualityScore"
                    stroke={CHART_COLORS.primary}
                    strokeWidth={2}
                    dot={(props) => {
                      const score = props.payload?.qualityScore as number;
                      const color = score >= 80 ? CHART_COLORS.emerald : score >= 60 ? CHART_COLORS.yellow : CHART_COLORS.orange;
                      return <circle key={props.key} cx={props.cx} cy={props.cy} r={3} fill={color} stroke="none" />;
                    }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-primary" />
              ДНК личности
              {dna.data?.sampleSize != null && (
                <span className="text-xs text-muted-foreground ml-auto font-normal">{dna.data.sampleSize} сообщ.</span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2 pb-0">
            {dna.isLoading || !dna.data || dna.data.sampleSize === 0 ? (
              <div className="h-[200px] flex items-center justify-center text-sm text-muted-foreground text-center">
                <div>
                  <BrainCircuit className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p>ДНК формируется из оценок качества</p>
                </div>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={190}>
                  <RadarChart data={dnaData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                    <PolarGrid stroke="hsl(var(--border))" opacity={0.5} />
                    <PolarAngleAxis dataKey="trait" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
                    <Radar dataKey="value" stroke={CHART_COLORS.primary} fill={CHART_COLORS.primary} fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
                <div className="grid grid-cols-2 gap-1 pb-3 px-1">
                  {dnaData.map((d) => (
                    <div key={d.trait} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{d.trait}</span>
                      <QualityBadge score={d.value} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" />
              По дням
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 pb-2">
            {dayData.length === 0 ? (
              <div className="h-[160px] flex items-center justify-center text-sm text-muted-foreground">Нет данных за 14 дней</div>
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={dayData} margin={{ top: 5, right: 5, bottom: 5, left: -25 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} vertical={false} />
                  <XAxis dataKey="dateShort" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} />
                  <Tooltip content={<CustomDayTooltip />} />
                  <Bar dataKey="total" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              Топ паттерны
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {metrics.isLoading ? (
              <div className="p-4 space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-7 w-full" />)}</div>
            ) : (metrics.data?.top_patterns ?? []).length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center py-8">Паттернов нет — начни обучение на стримерах</div>
            ) : (
              <div className="divide-y divide-border/30">
                {(metrics.data?.top_patterns ?? []).slice(0, 7).map((p, i) => (
                  <div key={i} className="px-4 py-2 flex items-center justify-between gap-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <span className="text-sm font-mono truncate">{p.content}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-foreground">×{p.frequency}</span>
                      <QualityBadge score={Math.round(p.qualityScore)} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-2 border-b border-border/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-primary" />
                Рефлексии
              </CardTitle>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-xs px-2"
                onClick={handleReflect}
                disabled={reflecting}
              >
                {reflecting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                <span className="ml-1">{reflecting ? "…" : "Запустить"}</span>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-auto" style={{ maxHeight: 220 }}>
            {reflections.isLoading ? (
              <div className="p-4 space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (reflections.data ?? []).length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center py-8">
                <p>Рефлексий нет</p>
                <p className="text-xs mt-1">Автоматически каждые 20 сообщений</p>
              </div>
            ) : (
              <div className="divide-y divide-border/30">
                {(reflections.data ?? []).map((r) => (
                  <div key={r.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "text-[10px] px-1.5 py-0.5 rounded-full border font-medium",
                          r.triggeredBy === "manual" ? "border-primary/30 text-primary" : "border-border text-muted-foreground"
                        )}>
                          {r.triggeredBy === "manual" ? "ручная" : "авто"}
                        </span>
                        {r.avgQualityBefore != null && (
                          <QualityBadge score={r.avgQualityBefore} />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(r.createdAt)}</span>
                    </div>
                    <p className="text-xs text-foreground/80 line-clamp-2">{r.critique}</p>
                    {r.promptDelta && (
                      <p className="text-xs text-primary/80 mt-1 italic line-clamp-1">→ {r.promptDelta}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="bg-card/50 border-border/50 flex flex-col" style={{ maxHeight: 360 }}>
          <CardHeader className="pb-2 border-b border-border/50 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-primary" />
              Последние сообщения
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            {(messages ?? []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Сообщений нет</div>
            ) : (
              <div className="divide-y divide-border/30">
                {(messages ?? []).map((msg) => (
                  <div key={msg.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono bg-secondary/50">
                          #{msg.channel}
                        </Badge>
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          {msg.trigger_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        <ScoreDot score={(msg as any).quality_score ?? null} />
                        <span className="text-[10px] text-muted-foreground">{formatRelativeTime(msg.created_at)}</span>
                      </div>
                    </div>
                    <p className="text-sm font-medium">"{msg.message}"</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-border/50 flex flex-col" style={{ maxHeight: 360 }}>
          <CardHeader className="pb-2 border-b border-border/50 shrink-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TerminalSquare className="w-4 h-4" />
              Live Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0 font-mono text-xs">
            {(logs ?? []).length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm font-sans">Нет активности</div>
            ) : (
              <div className="divide-y divide-border/30">
                {(logs ?? []).map((log) => (
                  <div key={log.id} className="px-4 py-2.5 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <Badge variant="outline" className={cn(
                        "px-1.5 py-0 rounded-sm font-mono text-[10px] uppercase border-border/50 flex items-center gap-1",
                        log.type === "error" && "text-destructive border-destructive/30",
                        log.type === "decision" && "text-primary border-primary/30",
                        log.type === "message_sent" && "text-emerald-500 border-emerald-500/30"
                      )}>
                        <LogTypeIcon type={log.type} />
                        {log.type}
                      </Badge>
                      <span className="text-[10px] text-muted-foreground">{formatRelativeTime(log.created_at)}</span>
                    </div>
                    <p className={cn("text-foreground/80 text-xs truncate", log.type === "error" && "text-destructive")}>
                      {log.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
