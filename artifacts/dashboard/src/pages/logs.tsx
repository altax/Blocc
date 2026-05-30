import { useState } from "react";
import { useGetLogs, getGetLogsQueryKey, GetLogsType } from "@workspace/api-client-react";
import { Card } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { TerminalSquare, Eye, Mic, BrainCircuit, MessageSquareText, Activity, FilterX } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
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

export default function Logs() {
  const [filterType, setFilterType] = useState<GetLogsType | "all">("all");
  
  const queryParams = filterType === "all" ? { limit: 50 } : { limit: 50, type: filterType };
  const { data: logs, isLoading } = useGetLogs(queryParams, { 
    query: { queryKey: getGetLogsQueryKey(queryParams), refetchInterval: 3000 } 
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full h-[calc(100vh-2rem)] flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">Raw telemetry and decision tracing.</p>
        </div>
        
        <div className="flex items-center space-x-2">
          <Select 
            value={filterType} 
            onValueChange={(v) => setFilterType(v as GetLogsType | "all")}
          >
            <SelectTrigger className="w-[180px] h-9">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Events</SelectItem>
              <SelectItem value="vision">Vision</SelectItem>
              <SelectItem value="speech">Speech</SelectItem>
              <SelectItem value="chat">Chat</SelectItem>
              <SelectItem value="decision">Decision</SelectItem>
              <SelectItem value="message_sent">Message Sent</SelectItem>
              <SelectItem value="error">Error</SelectItem>
            </SelectContent>
          </Select>
          
          {filterType !== "all" && (
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setFilterType("all")}>
              <FilterX className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <Card className="flex-1 bg-black/40 backdrop-blur-sm border-border/50 overflow-hidden flex flex-col font-mono text-sm shadow-xl">
        <div className="flex-1 overflow-auto p-4 space-y-1">
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(10)].map((_, i) => (
                <Skeleton key={i} className="h-8 w-full bg-muted/20" />
              ))}
            </div>
          ) : logs?.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
              <TerminalSquare className="h-10 w-10 mb-4 opacity-20" />
              <p>No logs found.</p>
            </div>
          ) : (
            logs?.map(log => (
              <div key={log.id} className="flex hover:bg-muted/30 p-1.5 rounded transition-colors group">
                <div className="w-24 shrink-0 text-muted-foreground opacity-50 select-none">
                  {new Date(log.created_at).toLocaleTimeString(undefined, { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
                </div>
                <div className="w-32 shrink-0">
                  <span className={cn(
                    "flex items-center gap-1.5 uppercase text-[10px] font-bold tracking-wider",
                    log.type === 'error' ? "text-destructive" :
                    log.type === 'decision' ? "text-primary" :
                    log.type === 'message_sent' ? "text-green-500" :
                    "text-muted-foreground"
                  )}>
                    <LogTypeIcon type={log.type} />
                    {log.type}
                  </span>
                </div>
                <div className="flex-1 break-words px-2 text-foreground/90">
                  {log.content}
                </div>
                {log.metadata && (
                  <div className="w-48 shrink-0 text-xs text-muted-foreground truncate opacity-0 group-hover:opacity-100 transition-opacity">
                    {log.metadata}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
