import { useState, useEffect, useRef } from "react";
import { useGetLogs, getGetLogsQueryKey, GetLogsType } from "@workspace/api-client-react";
import { formatRelativeTime } from "@/lib/format";
import { TerminalSquare, Eye, Mic, BrainCircuit, MessageSquareText, Activity, X } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const LOG_TYPES = [
  { value: "all", label: "Все" },
  { value: "vision", label: "Vision" },
  { value: "speech", label: "Speech" },
  { value: "chat", label: "Chat" },
  { value: "decision", label: "Решение" },
  { value: "message_sent", label: "Отправлено" },
  { value: "error", label: "Ошибка" },
] as const;

function logStyle(type: string) {
  switch (type) {
    case "error": return { dot: "bg-red-400", label: "text-red-400", row: "bg-red-500/4 border-red-500/10" };
    case "decision": return { dot: "bg-primary", label: "text-primary", row: "" };
    case "message_sent": return { dot: "bg-emerald-400 shadow-[0_0_4px_#34d399]", label: "text-emerald-400", row: "bg-emerald-500/4" };
    case "vision": return { dot: "bg-blue-400", label: "text-blue-400/80", row: "" };
    case "speech": return { dot: "bg-purple-400", label: "text-purple-400/80", row: "" };
    default: return { dot: "bg-white/20", label: "text-muted-foreground/50", row: "" };
  }
}

function LogIcon({ type }: { type: string }) {
  const cls = "w-3 h-3";
  switch (type) {
    case "vision": return <Eye className={cls} />;
    case "speech": return <Mic className={cls} />;
    case "decision": return <BrainCircuit className={cls} />;
    case "message_sent": return <MessageSquareText className={cls} />;
    case "error": return <Activity className={cls} />;
    default: return <TerminalSquare className={cls} />;
  }
}

export default function Logs() {
  const [filterType, setFilterType] = useState<GetLogsType | "all">("all");
  const bottomRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);

  const queryParams = filterType === "all" ? { limit: 100 } : { limit: 100, type: filterType };
  const { data: logs, isLoading } = useGetLogs(queryParams, {
    query: { queryKey: getGetLogsQueryKey(queryParams), refetchInterval: 2000 },
  });

  useEffect(() => {
    if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs?.length, autoScroll]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <TerminalSquare className="w-4.5 h-4.5 text-primary" />
            Live Логи
          </h1>
          <p className="text-xs text-muted-foreground/40 mt-0.5">Телеметрия и трейс решений в реальном времени</p>
        </div>

        {/* Filter tabs */}
        <div className="flex items-center gap-1 bg-white/3 rounded-lg p-1 border border-white/6">
          {LOG_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => setFilterType(t.value as any)}
              className={cn(
                "px-2.5 py-1 text-[11px] font-medium rounded transition-all",
                filterType === t.value
                  ? "bg-primary/20 text-primary"
                  : "text-muted-foreground/40 hover:text-muted-foreground/70"
              )}
            >
              {t.label}
            </button>
          ))}
          {filterType !== "all" && (
            <button onClick={() => setFilterType("all")} className="ml-1 p-1 text-muted-foreground/40 hover:text-muted-foreground">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Terminal */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto font-mono text-xs"
        style={{ background: "#050508" }}
      >
        {/* Header line */}
        <div className="px-4 py-2 text-muted-foreground/20 border-b border-white/3 select-none text-[10px]">
          <span className="w-24 inline-block">TIME</span>
          <span className="w-28 inline-block">TYPE</span>
          <span>CONTENT</span>
        </div>

        {isLoading ? (
          <div className="p-4 space-y-1">
            {[...Array(12)].map((_, i) => (
              <Skeleton key={i} className="h-6 bg-white/3" />
            ))}
          </div>
        ) : logs?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/20">
            <TerminalSquare className="w-10 h-10 mb-3" />
            <p className="text-sm">Нет логов</p>
          </div>
        ) : (
          <div>
            {logs?.map(log => {
              const s = logStyle(log.type);
              return (
                <div
                  key={log.id}
                  className={cn(
                    "flex items-start px-4 py-1.5 border-b border-white/2 group hover:bg-white/2 transition-colors",
                    s.row
                  )}
                >
                  <div className="w-24 shrink-0 text-muted-foreground/25 select-none tabular-nums">
                    {new Date(log.created_at).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </div>
                  <div className="w-28 shrink-0 flex items-center gap-1.5">
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", s.dot)} />
                    <span className={cn("uppercase text-[10px] font-bold tracking-wider flex items-center gap-1", s.label)}>
                      <LogIcon type={log.type} />
                      {log.type}
                    </span>
                  </div>
                  <div className="flex-1 break-words text-foreground/70 leading-relaxed">
                    {log.content}
                  </div>
                  {log.metadata && (
                    <div className="ml-4 shrink-0 max-w-[200px] text-muted-foreground/25 truncate opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">
                      {log.metadata}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Auto-scroll indicator */}
      {!autoScroll && logs && logs.length > 0 && (
        <div className="absolute bottom-6 right-6">
          <button
            onClick={() => { setAutoScroll(true); bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }}
            className="bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-[11px] px-3 py-1.5 rounded-full transition-colors"
          >
            ↓ к последним
          </button>
        </div>
      )}
    </div>
  );
}
