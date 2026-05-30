import { useGetMessages, getGetMessagesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatRelativeTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { MessageSquareText, Zap } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function Messages() {
  const { data: messages, isLoading } = useGetMessages({ limit: 100 }, { 
    query: { queryKey: getGetMessagesQueryKey({ limit: 100 }) } 
  });

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Message History</h1>
          <p className="text-sm text-muted-foreground mt-1">Audit log of all outputs generated and sent by the bot.</p>
        </div>
      </div>

      <div className="grid gap-4">
        {isLoading ? (
          [...Array(5)].map((_, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardContent className="p-5">
                <Skeleton className="h-5 w-3/4 mb-4" />
                <div className="flex gap-4">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              </CardContent>
            </Card>
          ))
        ) : messages?.length === 0 ? (
          <Card className="bg-card/50 border-border/50 flex flex-col items-center justify-center p-12 text-muted-foreground">
            <MessageSquareText className="h-12 w-12 mb-4 opacity-20" />
            <p>No messages have been sent yet.</p>
          </Card>
        ) : (
          messages?.map(msg => (
            <Card key={msg.id} className="bg-card/50 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-colors">
              <CardContent className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="font-mono text-xs">{msg.channel}</Badge>
                    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider flex items-center gap-1 border-primary/20 text-primary">
                      <Zap className="h-3 w-3" />
                      {msg.trigger_type}
                    </Badge>
                  </div>
                  <span className="text-xs text-muted-foreground font-mono">{formatRelativeTime(msg.created_at)}</span>
                </div>
                
                <div className="text-lg font-medium mb-3 text-foreground">
                  "{msg.message}"
                </div>

                {msg.context_summary && (
                  <div className="bg-black/20 p-3 rounded-md border border-border/30 text-sm text-muted-foreground border-l-2 border-l-primary/50">
                    <div className="text-[10px] uppercase font-bold tracking-wider mb-1 opacity-50">Context</div>
                    {msg.context_summary}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
