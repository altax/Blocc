import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Activity, LayoutDashboard, Settings, MessageSquareText, Hash, TerminalSquare, Power, PowerOff, Users, BrainCircuit } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetBotStatus, useStartBot, useStopBot, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const { data: status } = useGetBotStatus({ query: { queryKey: getGetBotStatusQueryKey(), refetchInterval: 3000 } });
  
  const startBot = useStartBot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    }
  });

  const stopBot = useStopBot({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() });
      }
    }
  });

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/logs", label: "Live Logs", icon: TerminalSquare },
    { href: "/messages", label: "Messages", icon: MessageSquareText },
    { href: "/streamers", label: "Стримеры", icon: Users },
    { href: "/learning", label: "Обучение ИИ", icon: BrainCircuit },
    { href: "/patterns", label: "Паттерны", icon: Hash },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen bg-background text-foreground selection:bg-primary/30">
      <aside className="w-64 border-r border-border/50 bg-card/50 flex flex-col backdrop-blur-xl">
        <div className="h-16 flex items-center px-6 border-b border-border/50">
          <Activity className="w-5 h-5 text-primary mr-3" />
          <span className="font-semibold tracking-tight text-sm">Twitch AI Bot</span>
        </div>
        
        <div className="p-4 flex-1">
          <nav className="space-y-1">
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={cn(
                "flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                location === item.href 
                  ? "bg-primary/10 text-primary" 
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}>
                <item.icon className={cn(
                  "mr-3 flex-shrink-0 h-4 w-4",
                  location === item.href ? "text-primary" : "text-muted-foreground"
                )} />
                {item.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="p-4 border-t border-border/50">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex flex-col">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Status</span>
              <div className="flex items-center mt-1">
                <span className={cn(
                  "w-2 h-2 rounded-full mr-2",
                  status?.running ? "bg-green-500 animate-pulse" : "bg-destructive"
                )} />
                <span className="text-sm font-medium">{status?.running ? "Online" : "Offline"}</span>
              </div>
            </div>
            {status?.running ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => stopBot.mutate()} disabled={stopBot.isPending}>
                <PowerOff className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:bg-green-500/10 hover:text-green-500" onClick={() => startBot.mutate()} disabled={startBot.isPending}>
                <Power className="h-4 w-4" />
              </Button>
            )}
          </div>
          {status?.channel && (
            <div className="text-xs text-muted-foreground truncate">
              Watching <span className="text-foreground font-medium">{status.channel}</span>
            </div>
          )}
        </div>
      </aside>
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
