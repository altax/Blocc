import { useEffect, useRef, useState, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Save, Bot, Clock, Brain, Key, CheckCircle2, XCircle, Loader2, Radio, ExternalLink, Tv2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

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

interface VerifyResult {
  ok: boolean;
  error?: string;
  live_count?: number;
  live_channels?: string[];
}

interface DeviceFlow {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresAt: number;
  status: "waiting" | "success" | "error";
  error?: string;
}

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initRef = useRef(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [deviceFlow, setDeviceFlow] = useState<DeviceFlow | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: settings, isLoading } = useGetSettings({
    query: { queryKey: getGetSettingsQueryKey() }
  });

  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Настройки сохранены", description: "Конфигурация бота обновлена." });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: (err: any) => {
        toast({ title: "Ошибка сохранения", description: err.message || "Что-то пошло не так.", variant: "destructive" });
      }
    }
  });

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      channel_name: "",
      bot_username: "",
      twitch_oauth_token: "",
      twitch_client_id: "",
      twitch_client_secret: "",
      openai_api_key: "",
      gemini_api_key: "",
      personality: DEFAULT_PERSONALITY,
      min_delay_seconds: 8,
      max_delay_seconds: 35,
      cooldown_seconds: 90,
      respond_to_chat: true,
      vision_enabled: true,
      speech_enabled: true,
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
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const pollDeviceFlow = useCallback((deviceCode: string, interval: number, expiresAt: number) => {
    if (Date.now() > expiresAt) {
      setDeviceFlow(prev => prev ? { ...prev, status: "error", error: "Время истекло. Начни заново." } : null);
      return;
    }
    pollTimerRef.current = setTimeout(async () => {
      try {
        const resp = await fetch("/api/settings/twitch-device-flow/poll", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ device_code: deviceCode }),
        });
        const data = await resp.json();
        if (data.pending) {
          pollDeviceFlow(deviceCode, interval, expiresAt);
        } else if (data.ok && data.token) {
          stopPolling();
          setDeviceFlow(prev => prev ? { ...prev, status: "success" } : null);
          form.setValue("twitch_oauth_token", data.token);
          queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
          toast({ title: "Токен получен!", description: "OAuth токен сохранён в базе данных." });
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
    if (!clientId) {
      toast({ title: "Укажи Client ID", description: "Заполни поле Client ID и сохрани настройки.", variant: "destructive" });
      return;
    }
    await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twitch_client_id: clientId, twitch_client_secret: values.twitch_client_secret }),
    });
    try {
      const resp = await fetch("/api/settings/twitch-device-flow/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId }),
      });
      const data = await resp.json();
      if (!data.ok) {
        toast({ title: "Ошибка", description: data.error, variant: "destructive" });
        return;
      }
      const flow: DeviceFlow = {
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri,
        interval: data.interval,
        expiresAt: Date.now() + data.expires_in * 1000,
        status: "waiting",
      };
      setDeviceFlow(flow);
      pollDeviceFlow(flow.deviceCode, flow.interval, flow.expiresAt);
    } catch {
      toast({ title: "Ошибка сети", variant: "destructive" });
    }
  };

  useEffect(() => () => stopPolling(), [stopPolling]);

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateMutation.mutate({ data: values });
  };

  const verifyTwitch = async () => {
    setVerifying(true);
    setVerifyResult(null);
    try {
      const values = form.getValues();
      await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          twitch_client_id: values.twitch_client_id,
          twitch_client_secret: values.twitch_client_secret,
        }),
      });
      const resp = await fetch("/api/settings/verify-twitch", { method: "POST" });
      const data = await resp.json();
      setVerifyResult(data);
    } catch {
      setVerifyResult({ ok: false, error: "Ошибка сети" });
    } finally {
      setVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto w-full space-y-6">
        <Skeleton className="h-8 w-48 mb-6" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto w-full pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Конфигурация</h1>
        <p className="text-sm text-muted-foreground mt-1">Личность бота, API ключи и параметры поведения.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

          {/* Identity */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Bot className="w-5 h-5 mr-2 text-primary" />
                Идентификация и цель
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bot_username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Никнейм бота (Twitch)</FormLabel>
                      <FormControl><Input className="bg-black/20" placeholder="mybot123" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="channel_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Целевой канал</FormLabel>
                      <FormControl><Input className="bg-black/20" placeholder="s1mple" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="personality"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Системный промпт / Личность</FormLabel>
                    <FormControl>
                      <Textarea
                        className="bg-black/20 min-h-[180px] font-mono text-xs leading-relaxed"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Основная директива, определяющая каждое решение и сообщение бота.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* API Keys */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Key className="w-5 h-5 mr-2 text-primary" />
                API ключи
              </CardTitle>
              <CardDescription>
                Ключи хранятся в базе данных. Оставь пустым — текущее значение не изменится.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="openai_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>OpenAI API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        className="bg-black/20 font-mono"
                        placeholder="sk-proj-..."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Нужен для GPT-4o (генерация сообщений) и Whisper (аудио).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="gemini_api_key"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gemini API Key</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        className="bg-black/20 font-mono"
                        placeholder="AIza..."
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>Нужен для Gemini 2.0 Flash (анализ видео стрима).</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="rounded-lg border border-border/40 bg-black/10 p-4 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-foreground">Twitch API (для точной проверки онлайна)</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Client ID + Client Secret → автоматически получает App Access Token. Не требует привязки к аккаунту.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={verifyTwitch}
                    disabled={verifying}
                    className="shrink-0 text-xs"
                  >
                    {verifying
                      ? <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Проверка...</>
                      : <><Radio className="w-3 h-3 mr-1.5" />Проверить</>}
                  </Button>
                </div>

                {verifyResult && (
                  <div className={`rounded-md px-3 py-2 text-xs flex items-start gap-2 ${verifyResult.ok ? "bg-green-950/40 border border-green-800/40 text-green-300" : "bg-red-950/40 border border-red-800/40 text-red-300"}`}>
                    {verifyResult.ok
                      ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-green-400" />
                      : <XCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />}
                    <div>
                      {verifyResult.ok
                        ? <>
                            <span className="font-medium">Подключено!</span>{" "}
                            Helix API работает.{" "}
                            {verifyResult.live_count !== undefined && (
                              <>Онлайн: <span className="font-medium">{verifyResult.live_count}</span> стримеров
                              {verifyResult.live_channels && verifyResult.live_channels.length > 0 && (
                                <> ({verifyResult.live_channels.join(", ")})</>
                              )}</>
                            )}
                          </>
                        : <><span className="font-medium">Ошибка:</span> {verifyResult.error}</>}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="twitch_client_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client ID</FormLabel>
                        <FormControl>
                          <Input
                            className="bg-black/20 font-mono"
                            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Из <span className="text-primary font-medium">dev.twitch.tv/console</span>
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="twitch_client_secret"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Client Secret</FormLabel>
                        <FormControl>
                          <Input
                            type="password"
                            className="bg-black/20 font-mono"
                            placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          Там же — кнопка "New Secret"
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
              <FormField
                control={form.control}
                name="twitch_oauth_token"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Twitch OAuth Token (для чата)</FormLabel>
                    <div className="flex gap-2">
                      <FormControl>
                        <Input
                          type="password"
                          className="bg-black/20 font-mono"
                          placeholder="oauth:..."
                          {...field}
                        />
                      </FormControl>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={startDeviceFlow}
                        disabled={deviceFlow?.status === "waiting"}
                        className="shrink-0 text-xs gap-1.5"
                      >
                        <Tv2 className="w-3.5 h-3.5" />
                        Получить токен
                      </Button>
                    </div>

                    {deviceFlow && (
                      <div className={`mt-2 rounded-lg border p-4 text-sm space-y-3 ${
                        deviceFlow.status === "success"
                          ? "bg-green-950/40 border-green-800/40"
                          : deviceFlow.status === "error"
                          ? "bg-red-950/40 border-red-800/40"
                          : "bg-blue-950/30 border-blue-800/40"
                      }`}>
                        {deviceFlow.status === "waiting" && (
                          <>
                            <div className="flex items-center gap-2 text-blue-300">
                              <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                              <span className="font-medium">Ожидаем авторизацию...</span>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">
                                1. Открой ссылку и войди в аккаунт бота на Twitch:
                              </p>
                              <a
                                href={deviceFlow.verificationUri}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-primary font-medium text-xs hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                {deviceFlow.verificationUri}
                              </a>
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground mb-1">2. Введи этот код:</p>
                              <div className="inline-flex items-center bg-black/40 rounded-md px-4 py-2 border border-blue-700/50">
                                <span className="font-mono text-xl font-bold tracking-[0.3em] text-blue-200">
                                  {deviceFlow.userCode}
                                </span>
                              </div>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              Токен запишется автоматически после подтверждения.
                            </p>
                          </>
                        )}
                        {deviceFlow.status === "success" && (
                          <div className="flex items-center gap-2 text-green-300">
                            <CheckCircle2 className="w-4 h-4 shrink-0" />
                            <span className="font-medium">Токен получен и сохранён!</span>
                          </div>
                        )}
                        {deviceFlow.status === "error" && (
                          <div className="flex items-center gap-2 text-red-300">
                            <XCircle className="w-4 h-4 shrink-0" />
                            <span>{deviceFlow.error}</span>
                          </div>
                        )}
                        {deviceFlow.status !== "waiting" && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeviceFlow(null)}
                            className="text-xs h-7 px-2"
                          >
                            Закрыть
                          </Button>
                        )}
                      </div>
                    )}

                    <FormDescription>
                      Токен с правом <code className="text-xs bg-black/30 px-1 rounded">chat:edit</code> — нужен чтобы бот писал в чат.
                      Нажми «Получить токен» для автоматического получения, или вручную через{" "}
                      <span className="text-primary font-medium">twitchapps.com/tmi</span>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Capabilities */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Brain className="w-5 h-5 mr-2 text-primary" />
                Возможности
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {(["vision_enabled", "speech_enabled", "respond_to_chat"] as const).map((name) => {
                const labels: Record<string, { title: string; desc: string }> = {
                  vision_enabled: { title: "Компьютерное зрение", desc: "Анализ скриншотов стрима через Gemini." },
                  speech_enabled: { title: "Распознавание речи", desc: "Транскрипция аудио стримера через Whisper." },
                  respond_to_chat: { title: "Взаимодействие с чатом", desc: "Чтение и ответы другим пользователям." },
                };
                return (
                  <FormField
                    key={name}
                    control={form.control}
                    name={name}
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-4 bg-black/10">
                        <div className="space-y-0.5">
                          <FormLabel className="text-base">{labels[name].title}</FormLabel>
                          <FormDescription>{labels[name].desc}</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                );
              })}
            </CardContent>
          </Card>

          {/* Timing */}
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Clock className="w-5 h-5 mr-2 text-primary" />
                Тайминги и ритм
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-2 gap-8">
                <FormField
                  control={form.control}
                  name="min_delay_seconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex justify-between">
                        <span>Мин. задержка</span>
                        <span className="text-muted-foreground font-mono">{field.value}с</span>
                      </FormLabel>
                      <FormControl>
                        <Slider min={1} max={60} step={1} value={[field.value]} onValueChange={(v) => field.onChange(v[0])} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="max_delay_seconds"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex justify-between">
                        <span>Макс. задержка</span>
                        <span className="text-muted-foreground font-mono">{field.value}с</span>
                      </FormLabel>
                      <FormControl>
                        <Slider min={2} max={120} step={1} value={[field.value]} onValueChange={(v) => field.onChange(v[0])} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="cooldown_seconds"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex justify-between">
                      <span>Кулдаун между сообщениями</span>
                      <span className="text-muted-foreground font-mono">{field.value}с</span>
                    </FormLabel>
                    <FormControl>
                      <Slider min={0} max={600} step={10} value={[field.value]} onValueChange={(v) => field.onChange(v[0])} />
                    </FormControl>
                    <FormDescription>
                      Обязательная пауза после отправки сообщения. Рекомендую 60–120с для антидетекта.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="bg-black/10 border-t border-border/50 py-4 flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending} className="min-w-[140px]">
                {updateMutation.isPending ? "Сохранение..." : <><Save className="w-4 h-4 mr-2" />Сохранить</>}
              </Button>
            </CardFooter>
          </Card>

        </form>
      </Form>
    </div>
  );
}
