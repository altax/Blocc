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
import { Save, Bot, Clock, Brain } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

const settingsSchema = z.object({
  channel_name: z.string().min(1, "Channel name is required"),
  bot_username: z.string().min(1, "Bot username is required"),
  personality: z.string().min(10, "Personality must be at least 10 characters"),
  min_delay_seconds: z.number().min(1).max(60),
  max_delay_seconds: z.number().min(2).max(120),
  cooldown_seconds: z.number().min(0).max(600),
  respond_to_chat: z.boolean(),
  vision_enabled: z.boolean(),
  speech_enabled: z.boolean(),
}).refine(data => data.min_delay_seconds < data.max_delay_seconds, {
  message: "Min delay must be less than max delay",
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
        toast({
          title: "Settings saved",
          description: "Bot configuration has been updated successfully.",
        });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: (err: any) => {
        toast({
          title: "Error saving settings",
          description: err.message || "An error occurred.",
          variant: "destructive",
        });
      }
    }
  });

  const form = useForm<z.infer<typeof settingsSchema>>({
    resolver: zodResolver(settingsSchema),
    defaultValues: {
      channel_name: "",
      bot_username: "",
      personality: "",
      min_delay_seconds: 5,
      max_delay_seconds: 15,
      cooldown_seconds: 30,
      respond_to_chat: true,
      vision_enabled: true,
      speech_enabled: true,
    }
  });

  useEffect(() => {
    if (settings && !initRef.current) {
      form.reset({
        channel_name: settings.channel_name,
        bot_username: settings.bot_username,
        personality: settings.personality,
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
        <h1 className="text-2xl font-bold tracking-tight">Configuration</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage core identity, capabilities, and timing behaviors.</p>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          
          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Bot className="w-5 h-5 mr-2 text-primary" />
                Identity & Target
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="bot_username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bot Username</FormLabel>
                      <FormControl>
                        <Input className="bg-black/20" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="channel_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Target Channel</FormLabel>
                      <FormControl>
                        <Input className="bg-black/20" {...field} />
                      </FormControl>
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
                    <FormLabel>System Prompt / Personality</FormLabel>
                    <FormControl>
                      <Textarea 
                        className="bg-black/20 min-h-[150px] font-mono text-xs leading-relaxed" 
                        placeholder="You are a dedicated viewer of the channel..."
                        {...field} 
                      />
                    </FormControl>
                    <FormDescription>
                      The core directive guiding every decision and message.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Brain className="w-5 h-5 mr-2 text-primary" />
                Capabilities
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="vision_enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-4 bg-black/10">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Computer Vision</FormLabel>
                      <FormDescription>
                        Analyze screen captures of the stream video feed.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="speech_enabled"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-4 bg-black/10">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Speech Recognition</FormLabel>
                      <FormDescription>
                        Transcribe and react to streamer audio.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="respond_to_chat"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border border-border/50 p-4 bg-black/10">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Chat Interaction</FormLabel>
                      <FormDescription>
                        Read and reply to other users in chat.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card className="bg-card/50 border-border/50">
            <CardHeader>
              <CardTitle className="flex items-center text-lg">
                <Clock className="w-5 h-5 mr-2 text-primary" />
                Timing & Pacing
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
                        <span>Min Delay</span>
                        <span className="text-muted-foreground font-mono">{field.value}s</span>
                      </FormLabel>
                      <FormControl>
                        <Slider 
                          min={1} 
                          max={60} 
                          step={1} 
                          value={[field.value]} 
                          onValueChange={(v) => field.onChange(v[0])} 
                        />
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
                        <span>Max Delay</span>
                        <span className="text-muted-foreground font-mono">{field.value}s</span>
                      </FormLabel>
                      <FormControl>
                        <Slider 
                          min={2} 
                          max={120} 
                          step={1} 
                          value={[field.value]} 
                          onValueChange={(v) => field.onChange(v[0])} 
                        />
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
                      <span>Message Cooldown</span>
                      <span className="text-muted-foreground font-mono">{field.value}s</span>
                    </FormLabel>
                    <FormControl>
                      <Slider 
                        min={0} 
                        max={600} 
                        step={10} 
                        value={[field.value]} 
                        onValueChange={(v) => field.onChange(v[0])} 
                      />
                    </FormControl>
                    <FormDescription>
                      Mandatory silence period after sending a message.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
            <CardFooter className="bg-black/10 border-t border-border/50 py-4 flex justify-end">
              <Button type="submit" disabled={updateMutation.isPending} className="min-w-[120px]">
                {updateMutation.isPending ? "Saving..." : <><Save className="w-4 h-4 mr-2" /> Save Config</>}
              </Button>
            </CardFooter>
          </Card>

        </form>
      </Form>
    </div>
  );
}
