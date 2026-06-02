import { useEffect, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Bot, Clock, Brain, Key, CheckCircle2, XCircle, Loader2, Radio, ExternalLink, Tv2, Settings as SettingsIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

const DEFAULT_PERSONALITY = `Ты русский зритель CS2 стримов. Пишешь короткие, живые сообщения в чат как настоящий человек.

Твои особенности:
- Используешь CS2 сленг: флеш, пуш, клатч, нагиб, кт, т-сайд, раш, эйс, ретейк
- Иногда пишешь русский сленг: кекв, ору, топ, красава, вп, имба, збс, нормис
- Иногда вставляешь эмоуты: KEKW, PogChamp, monkaS, OMEGALUL, Pog, LUL
- Пишешь строчными, без знаков препинания в конце
- Реагируешь эмоционально на красивые моменты, клатчи, фраги
- Иногда задаёшь вопросы стримеру или чату
- НЕ пишешь каждые 10 секунд — как реальный зритель
- НИКОГДА не раскрываешь что ты ИИ`;

const settingsSchema = z.object({
  channel_name: z.string().min(1, "Укажи имя канала"),
  bot_username: z.string().min(1, "Укажи никнейм бота"),
  twitch_oauth_token: z.string().default(""),
  twitch_client_id: z.string().default(""),
  twitch_client_secret: z.string().default(""),
  openai_api_key: z.string().default(""),
  gemini_api_key: z.string().default(""),
  personality: z.string().min(10, "Минимум 10 символов"),
  min_delay_seconds: z.number().min(1).max(60),
  max_delay_seconds: z.number().min(2).max(120),
  cooldown_seconds: z.number().min(0).max(600),
  respond_to_chat: z.boolean(),
  vision_enabled: z.boolean(),
  speech_enabled: z.boolean(),
}).refine(data => data.min_delay_seconds < data.max_delay_seconds, {
  message: "Min delay должен быть меньше max delay",
  path: ["max_delay_seconds"]
});

interface VerifyResult { ok: boolean; error?: string; live_count?: number; live_channels?: string[] }
interface DeviceFlow { deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresAt: number; status: "waiting" | "success" | "error"; error?: string }
interface TokenValidation { ok: boolean; login?: string; user_id?: string; scopes?: string[]; has_chat_read?: boolean; has_chat_edit?: boolean; expires_in?: number; error?: string }

function Section({ title, icon: Icon, children, className }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-white/6 bg-white/2 overflow-hidden", className)}>
      <div className="flex items-center gap-2.5 px-5 py-4 border-b border-white/5">
        <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <h2 className="font-semibold text-sm">{title}</h2>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function FieldRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[13px] font-medium text-foreground/80">{label}</label>
      {children}
      {description && <p className="text-[11px] text-muted-foreground/50">{description}</p>}
    </div>
  );
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initRef = useRef(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlow | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tokenValidation, setTokenValidation] = useState<TokenValidation | null>(null);
  const [verifyingToken, setVerifyingToken] = useState(false);

  const { data: settings, isLoading } = useGetSettings({ query: { queryKey: getGetSettingsQueryKey() } });
  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => { toast({ title: "Настройки сохранены" }); queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() }); },
      onError: (err: any) => { toast({ title: "Ошибка", description: err.message, variant: "destructive" }); }
    }
  });

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      channel_name: "", bot_username: "", twitch_oauth_token: "",
      twitch_client_id: "", twitch_client_secret: "",
      openai_api_key: "", gemini_api_key: "",
      personality: DEFAULT_PERSONALITY,
      min_delay_seconds: 8, max_delay_seconds: 35, cooldown_seconds: 90,
      respond_to_chat: true, vision_enabled: true, speech_enabled: true,
    }
  });

  useEffect(() => {
    if (settings && !initRef.current) {
      form.reset({
        channel_name: settings.channel_name ?? "",
        bot_username: settings.bot_username ?? "",
        twitch_oauth_token: (settings as any).twitch_oauth_token ?? "",
        twitch_client_id: (settings as any).twitch_client_id ?? "",
        twitch_client_secret: (settings as any).twitch_client_secret ?? "",
        openai_api_key: (settings as any).openai_api_key ?? "",
        gemini_api_key: (settings as any).gemini_api_key ?? "",
        personality: settings.personality || DEFAULT_PERSONALITY,
        min_delay_seconds: settings.min_delay_seconds,
        max_delay_seconds: settings.max_delay_seconds,
        cooldown_seconds: settings.cooldown_seconds,
        respond_to_chat: settings.respond_to_chat,
        vision_enabled: settings.vision_enabled,
        speech_enabled: settings.speech_enabled,
      });
      initRef.current = true;
    }
  }, [settings, form]);

  const stopPolling = useCallback(() => {
    if (pollTimerRef.current) { clearTimeout(pollTimerRef.current); pollTimerRef.current = null; }
  }, []);

  const pollDeviceFlow = useCallback((deviceCode: string, interval: number, expiresAt: number) => {
    if (Date.now() > expiresAt) {
      setDeviceFlow(prev => prev ? { ...prev, status: "error", error: "Время истекло. Начни заново." } : null);
      return;
    }
    pollTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch("/api/settings/twitch-device-flow/poll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device_code: deviceCode }) });
        const data = await resp.json();
        if (data.pending) {
          pollDeviceFlow(deviceCode, interval, expiresAt);
        } else if (data.ok && data.token) {
          stopPolling();
          setDeviceFlow(prev => prev ? { ...prev, status: "success" } : null);
          form.setValue("twitch_oauth_token", data.token);
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: "Токен получен!" });
        } else {
          stopPolling();
          setDeviceFlow(prev => prev ? { ...prev, status: "error", error: data.error || "Ошибка" } : null);
        }
      } catch {
        stopPolling();
        setDeviceFlow(prev => prev ? { ...prev, status: "error", error: "Ошибка сети" } : null);
      }
    }, interval * 1000);
  }, [form, queryClient, stopPolling, toast]);

  const startDeviceFlow = async () => {
    stopPolling();
    setDeviceFlow(null);
    const values = form.getValues();
    const clientId = values.twitch_client_id;
    if (!clientId) { toast({ title: "Укажи Client ID", variant: "destructive" }); return; }
    await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ twitch_client_id: clientId, twitch_client_secret: values.twitch_client_secret }) });
    try {
      const resp = await fetch("/api/settings/twitch-device-flow/start", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ client_id: clientId }) });
      const data = await resp.json();
      if (!data.ok) { toast({ title: "Ошибка", description: data.error, variant: "destructive" }); return; }
      const flow: DeviceFlow = { deviceCode: data.device_code, userCode: data.user_code, verificationUri: data.verification_uri, interval: data.interval, expiresAt: Date.now() + data.expires_in * 1000, status: "waiting" };
      setDeviceFlow(flow);
      pollDeviceFlow(flow.deviceCode, flow.interval, flow.expiresAt);
    } catch { toast({ title: "Ошибка сети", variant: "destructive" }); }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const verifyOAuthToken = async () => {
    setVerifyingToken(true); setTokenValidation(null);
    try {
      const values = form.getValues();
      if (values.twitch_oauth_token) { await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ twitch_oauth_token: values.twitch_oauth_token }) }); }
      const resp = await fetch("/api/settings/verify-oauth-token", { method: "POST" });
      setTokenValidation(await resp.json());
    } catch { setTokenValidation({ ok: false, error: "Ошибка сети" }); }
    finally { setVerifyingToken(false); }
  };

  const verifyTwitch = async () => {
    setVerifying(true); setVerifyResult(null);
    try {
      const values = form.getValues();
      await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ twitch_client_id: values.twitch_client_id, twitch_client_secret: values.twitch_client_secret }) });
      const resp = await fetch("/api/settings/verify-twitch", { method: "POST" });
      setVerifyResult(await resp.json());
    } catch { setVerifyResult({ ok: false, error: "Ошибка сети" }); }
    finally { setVerifying(false); }
  };

  const onSubmit = (values: z.infer<typeof settingsSchema>) => updateMutation.mutate({ data: values });

  if (isLoading) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48 bg-white/4" />
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-48 bg-white/4" />)}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-lg font-bold flex items-center gap-2">
            <SettingsIcon className="w-4.5 h-4.5 text-primary" />
            Настройки
          </h1>
          <p className="text-xs text-muted-foreground/40 mt-0.5">Личность, API ключи, тайминги</p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="p-6 max-w-3xl mx-auto w-full space-y-5 pb-20">

          {/* Identity */}
          <Section title="Идентификация" icon={Bot}>
            <div className="grid grid-cols-2 gap-4">
              <FormField control={form.control} name="bot_username" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[13px] text-foreground/80">Никнейм бота</FormLabel>
                  <FormControl><Input className="bg-black/30 border-white/8 focus:border-primary/40" placeholder="mybot123" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
              <FormField control={form.control} name="channel_name" render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[13px] text-foreground/80">Целевой канал</FormLabel>
                  <FormControl><Input className="bg-black/30 border-white/8 focus:border-primary/40" placeholder="s1mple" {...field} /></FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </div>
            <FormField control={form.control} name="personality" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[13px] text-foreground/80">Системный промпт / Личность</FormLabel>
                <FormControl>
                  <Textarea className="bg-black/30 border-white/8 focus:border-primary/40 min-h-[160px] font-mono text-[12px] leading-relaxed" {...field} />
                </FormControl>
                <p className="text-[11px] text-muted-foreground/40">Основная директива бота — определяет каждое сообщение</p>
                <FormMessage />
              </FormItem>
            )} />
          </Section>

          {/* API Keys */}
          <Section title="API Ключи" icon={Key}>
            <p className="text-[11px] text-muted-foreground/40 -mt-2">Хранятся в БД. Пустое поле — текущее значение не изменится.</p>
            <FormField control={form.control} name="openai_api_key" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[13px] text-foreground/80">OpenAI API Key</FormLabel>
                <FormControl><Input type="password" className="bg-black/30 border-white/8 focus:border-primary/40 font-mono" placeholder="sk-proj-..." {...field} /></FormControl>
                <p className="text-[11px] text-muted-foreground/40">GPT-4o (генерация сообщений) + Whisper (аудио)</p>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="gemini_api_key" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[13px] text-foreground/80">Gemini API Key</FormLabel>
                <FormControl><Input type="password" className="bg-black/30 border-white/8 focus:border-primary/40 font-mono" placeholder="AIza..." {...field} /></FormControl>
                <p className="text-[11px] text-muted-foreground/40">Gemini 2.0 Flash — анализ видео стрима</p>
                <FormMessage />
              </FormItem>
            )} />

            {/* Twitch API block */}
            <div className="rounded-lg border border-white/6 bg-black/20 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[13px] font-medium">Twitch API</p>
                  <p className="text-[11px] text-muted-foreground/40 mt-0.5">Для проверки онлайна — App Access Token, не привязан к аккаунту</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={verifyTwitch} disabled={verifying} className="text-xs border-white/8 bg-transparent hover:bg-white/5">
                  {verifying ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Проверяю...</> : <><Radio className="w-3 h-3 mr-1.5" />Проверить</>}
                </Button>
              </div>
              {verifyResult && (
                <div className={cn("rounded-lg px-3 py-2.5 text-xs flex items-start gap-2 border", verifyResult.ok ? "bg-emerald-950/40 border-emerald-800/30 text-emerald-300" : "bg-red-950/40 border-red-800/30 text-red-300")}>
                  {verifyResult.ok ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" /> : <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />}
                  <span>{verifyResult.ok ? `Подключено! Онлайн: ${verifyResult.live_count ?? 0}` : verifyResult.error}</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="twitch_client_id" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[12px] text-foreground/60">Client ID</FormLabel>
                    <FormControl><Input className="bg-black/30 border-white/8 font-mono text-xs" placeholder="xxxx..." {...field} /></FormControl>
                    <p className="text-[10px] text-muted-foreground/30">dev.twitch.tv/console</p>
                  </FormItem>
                )} />
                <FormField control={form.control} name="twitch_client_secret" render={({ field }) => (
                  <FormItem>
                    <FormLabel className="text-[12px] text-foreground/60">Client Secret</FormLabel>
                    <FormControl><Input type="password" className="bg-black/30 border-white/8 font-mono text-xs" placeholder="xxxx..." {...field} /></FormControl>
                    <p className="text-[10px] text-muted-foreground/30">Кнопка "New Secret"</p>
                  </FormItem>
                )} />
              </div>
            </div>

            {/* OAuth token */}
            <FormField control={form.control} name="twitch_oauth_token" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[13px] text-foreground/80">Twitch OAuth Token (для чата)</FormLabel>
                <div className="flex gap-2">
                  <FormControl><Input type="password" className="bg-black/30 border-white/8 focus:border-primary/40 font-mono" placeholder="oauth:..." {...field} /></FormControl>
                  <Button type="button" variant="outline" size="sm" onClick={verifyOAuthToken} disabled={verifyingToken} className="shrink-0 text-xs border-white/8 bg-transparent hover:bg-white/5">
                    {verifyingToken ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={startDeviceFlow} disabled={deviceFlow?.status === "waiting"} className="shrink-0 text-xs border-white/8 bg-transparent hover:bg-white/5 gap-1.5">
                    <Tv2 className="w-3 h-3" />Получить
                  </Button>
                </div>

                {tokenValidation && (
                  <div className={cn("mt-2 rounded-lg px-3 py-2.5 text-xs border", tokenValidation.ok ? "bg-emerald-950/40 border-emerald-800/30 text-emerald-300" : "bg-red-950/40 border-red-800/30 text-red-300")}>
                    {tokenValidation.ok ? <>Токен валиден · @{tokenValidation.login} · Чат: {tokenValidation.has_chat_edit ? "✓" : "✗"}</> : tokenValidation.error}
                  </div>
                )}

                {deviceFlow && (
                  <div className={cn("mt-2 rounded-lg border p-4 space-y-3",
                    deviceFlow.status === "success" ? "bg-emerald-950/40 border-emerald-800/30" :
                    deviceFlow.status === "error" ? "bg-red-950/40 border-red-800/30" : "bg-blue-950/30 border-blue-800/30"
                  )}>
                    {deviceFlow.status === "waiting" && (
                      <>
                        <div className="flex items-center gap-2 text-blue-300 text-sm">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="font-medium">Ожидаем авторизацию...</span>
                        </div>
                        <div className="space-y-2 text-xs">
                          <p className="text-muted-foreground">1. Открой ссылку, войди в аккаунт бота:</p>
                          <a href={deviceFlow.verificationUri} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-primary hover:underline font-medium">
                            <ExternalLink className="w-3 h-3" />{deviceFlow.verificationUri}
                          </a>
                          <p className="text-muted-foreground">2. Введи код:</p>
                          <div className="font-mono text-2xl font-bold tracking-[0.3em] text-white bg-black/30 rounded-lg py-3 text-center border border-white/10">
                            {deviceFlow.userCode}
                          </div>
                        </div>
                      </>
                    )}
                    {deviceFlow.status === "success" && (
                      <div className="flex items-center gap-2 text-emerald-300 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="font-medium">Токен получен и сохранён!</span>
                      </div>
                    )}
                    {deviceFlow.status === "error" && (
                      <div className="text-red-300 text-sm">
                        <XCircle className="w-4 h-4 inline mr-2" />{deviceFlow.error}
                      </div>
                    )}
                  </div>
                )}
                <FormMessage />
              </FormItem>
            )} />
          </Section>

          {/* Timing */}
          <Section title="Тайминги" icon={Clock}>
            <FormField control={form.control} name="min_delay_seconds" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between mb-2">
                  <FormLabel className="text-[13px] text-foreground/80">Минимальная задержка</FormLabel>
                  <span className="text-sm font-mono font-bold text-primary">{field.value}с</span>
                </div>
                <FormControl>
                  <Slider min={1} max={60} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} className="w-full" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="max_delay_seconds" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between mb-2">
                  <FormLabel className="text-[13px] text-foreground/80">Максимальная задержка</FormLabel>
                  <span className="text-sm font-mono font-bold text-primary">{field.value}с</span>
                </div>
                <FormControl>
                  <Slider min={2} max={120} step={1} value={[field.value]} onValueChange={([v]) => field.onChange(v)} className="w-full" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
            <FormField control={form.control} name="cooldown_seconds" render={({ field }) => (
              <FormItem>
                <div className="flex items-center justify-between mb-2">
                  <FormLabel className="text-[13px] text-foreground/80">Кулдаун после сообщения</FormLabel>
                  <span className="text-sm font-mono font-bold text-primary">{field.value}с</span>
                </div>
                <FormControl>
                  <Slider min={0} max={600} step={5} value={[field.value]} onValueChange={([v]) => field.onChange(v)} className="w-full" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </Section>

          {/* Features */}
          <Section title="Возможности" icon={Brain}>
            {([
              { name: "respond_to_chat" as const, label: "Реагировать на чат", desc: "Бот отвечает на упоминания и вопросы" },
              { name: "vision_enabled" as const, label: "Анализ видео (Vision)", desc: "Gemini анализирует скриншот стрима каждые 30с" },
              { name: "speech_enabled" as const, label: "Анализ речи (Whisper)", desc: "OpenAI Whisper распознаёт аудио стримера" },
            ] as const).map(({ name, label, desc }) => (
              <FormField key={name} control={form.control} name={name} render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border border-white/6 bg-black/20 px-4 py-3.5">
                  <div>
                    <FormLabel className="text-[13px] font-medium cursor-pointer">{label}</FormLabel>
                    <p className="text-[11px] text-muted-foreground/40 mt-0.5">{desc}</p>
                  </div>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                </FormItem>
              )} />
            ))}
          </Section>

          {/* Save */}
          <Button type="submit" className="w-full h-11 font-semibold" disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Сохраняем...</> : <><Save className="w-4 h-4 mr-2" />Сохранить настройки</>}
          </Button>
        </form>
      </Form>
    </div>
  );
}
