import { useGetBotStatus, useGetStats, useGetLogs, useGetMessages, getGetBotStatusQueryKey, getGetStatsQueryKey, getGetLogsQueryKey, getGetMessagesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUptime, formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { TerminalSquare, MessageSquareText, Activity, Hash, Eye, Mic, BrainCircuit } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function LogTypeIcon({ type }: { type: string }) {
  switch (type) {
    case 'vision': return <Eye className="w-3 h-3" />;
    case 'speech': return <Mic className="w-3 h-3" />;
    case 'decision': return <BrainCircuit className="w-3 h-3 text-primary" />;
    case 'message_sent': return <MessageSquareText className="w-3 h-3 text-green-500" />;
    case 'error': return <Activity className="w-3 h-3 text-destructive" />;
    default: return <TerminalSquare className="w-3 h-3" />;
  }
}

export default function Dashboard() {
  const { data: status, isLoading: statusLoading } = useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey(), refetchInterval: 3000 } });
  const { data: stats, isLoading: statsLoading } = useGetStats({ query: { queryKey: getGetStatsQueryKey(), refetchInterval: 5000 } });
  const { data: logs, isLoading: logsLoading } = useGetLogs({ limit: 5 }, { query: { queryKey: getGetLogsQueryKey({ limit: 5 }), refetchInterval: 3000 } });
  const { data: messages, isLoading: messagesLoading } = useGetMessages({ limit: 5 }, { query: { queryKey: getGetMessagesQueryKey({ limit: 5 }), refetchInterval: 5000 } });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">Live monitoring and bot telemetry.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Uptime</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statusLoading ? <Skeleton className="h-7 w-20" /> : (
              <div className="text-2xl font-bold text-primary font-mono">{formatUptime(status?.uptime_seconds || 0)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Current session</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Messages Sent</CardTitle>
            <MessageSquareText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-7 w-20" /> : (
              <div className="text-2xl font-bold font-mono">{stats?.messages_today || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Today</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Learned Patterns</CardTitle>
            <Hash className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-7 w-20" /> : (
              <div className="text-2xl font-bold font-mono">{stats?.total_patterns_learned || 0}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Across {stats?.channels_learned_from || 0} channels</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Response Delay</CardTitle>
            <TerminalSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {statsLoading ? <Skeleton className="h-7 w-20" /> : (
              <div className="text-2xl font-bold font-mono">{stats?.avg_response_delay_seconds?.toFixed(1) || "0.0"}s</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Simulated human delay</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-card/50 backdrop-blur-sm border-border/50 flex flex-col h-[400px]">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center">
              <TerminalSquare className="w-4 h-4 mr-2" />
              Live Telemetry
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            {logsLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : logs?.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No recent activity.
              </div>
            ) : (
              <div className="divide-y divide-border/50 font-mono text-xs">
                {logs?.map(log => (
                  <div key={log.id} className="p-3 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center space-x-2">
                        <Badge variant="outline" className={cn(
                          "px-1.5 py-0 rounded-sm font-mono text-[10px] uppercase border-border/50 flex items-center gap-1.5",
                          log.type === 'error' && "text-destructive border-destructive/30",
                          log.type === 'decision' && "text-primary border-primary/30",
                          log.type === 'message_sent' && "text-green-500 border-green-500/30"
                        )}>
                          <LogTypeIcon type={log.type} />
                          {log.type}
                        </Badge>
                      </div>
                      <span className="text-muted-foreground opacity-70">{formatRelativeTime(log.created_at)}</span>
                    </div>
                    <div className={cn(
                      "text-foreground",
                      log.type === 'error' && "text-destructive"
                    )}>
                      {log.content}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-sm border-border/50 flex flex-col h-[400px]">
          <CardHeader className="pb-3 border-b border-border/50">
            <CardTitle className="text-sm font-semibold flex items-center">
              <MessageSquareText className="w-4 h-4 mr-2" />
              Recent Outputs
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            {messagesLoading ? (
              <div className="p-4 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : messages?.length === 0 ? (
              <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                No messages sent yet.
              </div>
            ) : (
              <div className="divide-y divide-border/50">
                {messages?.map(msg => (
                  <div key={msg.id} className="p-4 hover:bg-muted/50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant="secondary" className="px-1.5 py-0 text-[10px] font-mono uppercase bg-secondary/50">
                        {msg.channel}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{formatRelativeTime(msg.created_at)}</span>
                    </div>
                    <p className="text-sm font-medium mb-1">"{msg.message}"</p>
                    <div className="text-xs text-muted-foreground flex items-center">
                      <span className="opacity-70 mr-1">Trigger:</span>
                      <span className="text-foreground">{msg.trigger_type}</span>
                    </div>
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
