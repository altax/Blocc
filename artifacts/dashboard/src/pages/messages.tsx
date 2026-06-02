import { useGetMessages, getGetMessagesQueryKey } from "@workspace/api-client-react";
import { formatRelativeTime } from "@/lib/format";
import { MessageSquareText, Zap, Bot } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

const TRIGGER_COLOR: Record<string, string> = {
  scheduled: "text-blue-400/80 border-blue-500/20 bg-blue-500/8",
  vision: "text-purple-400/80 border-purple-500/20 bg-purple-500/8",
  speech: "text-cyan-400/80 border-cyan-500/20 bg-cyan-500/8",
  chat_mention: "text-emerald-400/80 border-emerald-500/20 bg-emerald-500/8",
  manual: "text-yellow-400/80 border-yellow-500/20 bg-yellow-500/8",
};

export default function Messages() {
  const { data: messages, isLoading } = useGetMessages({ limit: 100 }, {
    query: { queryKey: getGetMessagesQueryKey({ limit: 100 }), refetchInterval: 5000 },
  });

  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header */}
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <MessageSquareText className="w-4.5 h-4.5 text-primary" />
            История сообщений
          </h1>
          <p className="text-xs text-muted-foreground/40 mt-0.5">Все сообщения отправленные ботом с контекстом</p>
        </div>
        {messages && (
          <div className="text-xs text-muted-foreground/30 font-mono border border-white/6 rounded-lg px-3 py-1.5">
            {messages.length} сообщений
          </div>
        )}
      </div>

      {/* Feed */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-xl border border-white/5 p-4 space-y-3">
                <Skeleton className="h-5 w-3/4 bg-white/4" />
                <Skeleton className="h-4 w-1/2 bg-white/4" />
              </div>
            ))}
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground/20 gap-3">
            <Bot className="w-10 h-10" />
            <p className="text-sm">Бот ещё не отправил ни одного сообщения</p>
          </div>
        ) : (
          <div className="p-6 space-y-2 max-w-4xl mx-auto w-full">
            {messages?.map(msg => (
              <div
                key={msg.id}
                className="group rounded-xl border border-white/5 bg-white/2 hover:border-white/10 hover:bg-white/3 transition-all p-4"
              >
                <div className="flex items-start gap-4">
                  {/* Bot avatar */}
                  <div className="w-8 h-8 rounded-full bg-primary/15 border border-primary/20 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="w-4 h-4 text-primary/70" />
                  </div>

                  <div className="flex-1 min-w-0">
                    {/* Meta row */}
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[11px] font-mono font-semibold text-primary/60 border border-primary/20 bg-primary/8 rounded px-1.5 py-0.5">
                        #{msg.channel}
                      </span>
                      <span className={cn(
                        "text-[10px] font-mono font-medium border rounded px-1.5 py-0.5 flex items-center gap-1",
                        TRIGGER_COLOR[msg.trigger_type] ?? "text-muted-foreground/40 border-white/8"
                      )}>
                        <Zap className="w-2.5 h-2.5" />
                        {msg.trigger_type}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground/25 font-mono">{formatRelativeTime(msg.created_at)}</span>
                    </div>

                    {/* Message */}
                    <div className="text-[15px] font-medium text-foreground/85 leading-relaxed mb-2.5 font-mono">
                      "{msg.message}"
                    </div>

                    {/* Context */}
                    {msg.context_summary && (
                      <div className="text-[11px] text-muted-foreground/40 leading-relaxed border-l-2 border-primary/20 pl-3 bg-white/2 rounded-r-lg py-1.5 pr-3">
                        {msg.context_summary}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
