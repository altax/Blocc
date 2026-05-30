import { useState } from "react";
import { useGetPatterns, useLearnFromChannel, getGetPatternsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Hash, Download, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";

export default function Patterns() {
  const [channelInput, setChannelInput] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: patterns, isLoading } = useGetPatterns({ limit: 100 }, { 
    query: { queryKey: getGetPatternsQueryKey({ limit: 100 }) } 
  });

  const learnMutation = useLearnFromChannel({
    mutation: {
      onSuccess: (res) => {
        toast({
          title: "Learning complete",
          description: `Harvested ${res.patterns_found} patterns from ${res.channel}.`,
        });
        setChannelInput("");
        queryClient.invalidateQueries({ queryKey: getGetPatternsQueryKey({ limit: 100 }) });
      },
      onError: (err: any) => {
        toast({
          title: "Learning failed",
          description: err.message || "Could not harvest patterns.",
          variant: "destructive",
        });
      }
    }
  });

  const handleLearn = (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelInput) return;
    learnMutation.mutate({ data: { channel: channelInput, message_count: 500 } });
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto w-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Learned Patterns</h1>
          <p className="text-sm text-muted-foreground mt-1">Harvested chat behaviors grouped by trigger type.</p>
        </div>
      </div>

      <Card className="bg-card/50 backdrop-blur-sm border-primary/20 shadow-lg shadow-primary/5">
        <CardHeader>
          <CardTitle className="text-lg flex items-center">
            <Download className="w-5 h-5 mr-2 text-primary" />
            Harvest Channel Data
          </CardTitle>
          <CardDescription>
            Scrape recent VODs or live chat to extract natural interaction patterns.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLearn} className="flex gap-4 max-w-md">
            <Input 
              placeholder="Twitch channel name..." 
              value={channelInput}
              onChange={(e) => setChannelInput(e.target.value)}
              className="bg-black/20"
            />
            <Button type="submit" disabled={!channelInput || learnMutation.isPending} className="min-w-[120px]">
              {learnMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Learning</>
              ) : (
                "Start Harvest"
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading ? (
          [...Array(6)].map((_, i) => (
            <Card key={i} className="bg-card/50 border-border/50">
              <CardContent className="p-5 space-y-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-4 w-16" />
              </CardContent>
            </Card>
          ))
        ) : patterns?.length === 0 ? (
          <div className="col-span-full py-12 text-center text-muted-foreground border border-dashed rounded-lg border-border/50 bg-black/10">
            <Hash className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No patterns learned yet. Harvest a channel to begin.</p>
          </div>
        ) : (
          patterns?.map(pattern => (
            <Card key={pattern.id} className="bg-card/50 border-border/50 hover:border-border transition-colors">
              <CardContent className="p-5">
                <div className="flex items-center justify-between mb-3">
                  <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-wider text-primary border-primary/30">
                    {pattern.pattern_type}
                  </Badge>
                  <span className="text-xs text-muted-foreground">Freq: {pattern.frequency}</span>
                </div>
                <div className="text-sm font-medium mb-4 text-foreground/90 leading-relaxed">
                  "{pattern.content}"
                </div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase flex items-center">
                  <span className="opacity-50 mr-1">Source:</span> {pattern.source_channel}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
