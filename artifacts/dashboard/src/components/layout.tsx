import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import {
  Activity, LayoutDashboard, Settings, MessageSquareText,
  Hash, TerminalSquare, Power, PowerOff, Users, BrainCircuit,
  FlaskConical, Radio, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useGetBotStatus, useStartBot, useStopBot, getGetBotStatusQueryKey } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";

const NAV_GROUPS = [
  {
    label: "Мониторинг",
    items: [
      { href: "/", label: "Командный центр", icon: LayoutDashboard },
      { href: "/logs", label: "Live Логи", icon: TerminalSquare },
      { href: "/messages", label: "Сообщения", icon: MessageSquareText },
    ],
  },
  {
    label: "Обучение",
    items: [
      { href: "/streamers", label: "Стримеры", icon: Users },
      { href: "/learning", label: "Обучение ИИ", icon: BrainCircuit },
      { href: "/patterns", label: "Паттерны", icon: Hash },
    ],
  },
  {
    label: "Инструменты",
    items: [
      { href: "/test-bot", label: "Тест ИИ", icon: FlaskConical },
      { href: "/settings", label: "Настройки", icon: Settings },
    ],
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const queryClient = useQueryClient();

  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  const { data: status } = useGetBotStatus({
    query: { queryKey: getGetBotStatusQueryKey(), refetchInterval: 3000 },
  });

  const startBot = useStartBot({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() }) },
  });
  const stopBot = useStopBot({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: getGetBotStatusQueryKey() }) },
  });

  const isRunning = status?.running ?? false;

  return (
    <div className="flex min-h-screen bg-[#0a0a0f] text-foreground selection:bg-primary/30">
      <aside className="w-56 border-r border-white/5 flex flex-col shrink-0" style={{ background: "linear-gradient(180deg, #0d0d14 0%, #0a0a0f 100%)" }}>

        {/* Brand */}
        <div className="h-14 flex items-center px-4 border-b border-white/5">
          <div className="w-7 h-7 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center mr-2.5 shrink-0">
            <Zap className="w-3.5 h-3.5 text-primary" />
          </div>
          <div>
            <div className="text-[13px] font-semibold tracking-tight leading-none">BotCore</div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">CS2 AI Engine</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 py-3 space-y-4 overflow-y-auto">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <div className="px-2 mb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/40">
                {group.label}
              </div>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = location === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center px-2.5 py-2 text-[13px] font-medium rounded-md transition-all duration-150",
                        active
                          ? "bg-primary/15 text-primary"
                          : "text-muted-foreground/70 hover:text-foreground hover:bg-white/5"
                      )}
                    >
                      <item.icon className={cn("mr-2.5 h-3.5 w-3.5 shrink-0", active ? "text-primary" : "text-muted-foreground/50")} />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Bot Status */}
        <div className="p-3 border-t border-white/5">
          <div className={cn(
            "rounded-lg p-3 border transition-all duration-500",
            isRunning
              ? "bg-emerald-500/8 border-emerald-500/20"
              : "bg-white/3 border-white/8"
          )}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={cn(
                  "w-2 h-2 rounded-full",
                  isRunning ? "bg-emerald-400 animate-pulse shadow-[0_0_6px_#34d399]" : "bg-white/20"
                )} />
                <span className={cn("text-xs font-semibold", isRunning ? "text-emerald-400" : "text-muted-foreground/50")}>
                  {isRunning ? "ONLINE" : "OFFLINE"}
                </span>
              </div>
              {isRunning ? (
                <Button
                  size="icon" variant="ghost"
                  className="h-6 w-6 text-red-400/70 hover:text-red-400 hover:bg-red-400/10"
                  onClick={() => stopBot.mutate()}
                  disabled={stopBot.isPending}
                >
                  <PowerOff className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  size="icon" variant="ghost"
                  className="h-6 w-6 text-emerald-400/70 hover:text-emerald-400 hover:bg-emerald-400/10"
                  onClick={() => startBot.mutate()}
                  disabled={startBot.isPending}
                >
                  <Power className="h-3 w-3" />
                </Button>
              )}
            </div>
            {isRunning && status?.channel ? (
              <div className="flex items-center gap-1.5">
                <Radio className="w-2.5 h-2.5 text-emerald-400/60" />
                <span className="text-[11px] text-emerald-400/80 font-mono truncate">#{status.channel}</span>
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground/30">Бот не запущен</div>
            )}
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
