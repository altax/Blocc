import { useEffect, useRef } from "react";
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
import { Save, Bot, Clock, Brain, Key } from "lucide-react";
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

export default function Settings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const initRef = useRef(false);

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

  const onSubmit = (values: z.infer<typeof settingsSchema>) => {
    updateMutation.mutate({ data: values });
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="twitch_client_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twitch Client ID</FormLabel>
                      <FormControl>
                        <Input
                          className="bg-black/20 font-mono"
                          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Из <span className="text-primary">dev.twitch.tv/console</span>. Нужен для точной проверки онлайна через Helix API.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="twitch_oauth_token"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Twitch OAuth Token</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          className="bg-black/20 font-mono"
                          placeholder="oauth:..."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Токен с правом <code className="text-xs bg-black/30 px-1 rounded">chat:write</code>.
                        Получить: <span className="text-primary">twitchapps.com/tmi</span>
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
