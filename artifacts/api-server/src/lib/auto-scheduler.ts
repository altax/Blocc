import { detectLiveChannels, type ChannelActivity } from "./live-detector";
import { collectPatternsFromChannel } from "./bot-engine/pattern-learner";
import { getPresetChannels } from "./cs2-ru-streamers";
import { logger } from "./logger";

export interface SchedulerOptions {
  /** Интервал между проверками кто онлайн (мс). По умолчанию 3 часа. */
  checkIntervalMs?: number;
  /** Минимальное время между сборами одного канала (мс). По умолчанию 12 часов. */
  minCollectionIntervalMs?: number;
  /** Количество сообщений на канал при авто-сборе. По умолчанию 300. */
  messagesPerChannel?: number;
  /** Время IRC-окна для детекции (мс). По умолчанию 30 секунд. */
  detectionWindowMs?: number;
}

export interface SchedulerStatus {
  running: boolean;
  check_interval_hours: number;
  min_collection_interval_hours: number;
  messages_per_channel: number;
  next_check_at: string | null;
  last_check_at: string | null;
  last_live_channels: string[];
  currently_collecting: string[];
  collection_history: CollectionRecord[];
  total_auto_collections: number;
}

export interface CollectionRecord {
  channel: string;
  started_at: string;
  finished_at: string | null;
  patterns_saved: number | null;
  trigger: "auto" | "manual";
}

const DEFAULT_CHECK_INTERVAL = 3 * 60 * 60 * 1000;   // 3 часа
const DEFAULT_MIN_COLLECTION  = 12 * 60 * 60 * 1000;  // 12 часов
const DEFAULT_MESSAGES        = 300;
const DEFAULT_DETECTION_WINDOW = 30_000;

class AutoScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  private checkIntervalMs    = DEFAULT_CHECK_INTERVAL;
  private minCollectionMs    = DEFAULT_MIN_COLLECTION;
  private messagesPerChannel = DEFAULT_MESSAGES;
  private detectionWindowMs  = DEFAULT_DETECTION_WINDOW;

  private nextCheckAt:    Date | null = null;
  private lastCheckAt:    Date | null = null;
  private lastLive:       string[]    = [];
  private currentlyCollecting         = new Set<string>();
  private collectionHistory:          CollectionRecord[] = [];
  private lastCollectedAt             = new Map<string, number>(); // channel → ms timestamp

  start(options: SchedulerOptions = {}): void {
    if (this.running) {
      logger.info("Scheduler already running, reconfiguring");
      this.stop();
    }

    this.checkIntervalMs    = options.checkIntervalMs    ?? DEFAULT_CHECK_INTERVAL;
    this.minCollectionMs    = options.minCollectionIntervalMs ?? DEFAULT_MIN_COLLECTION;
    this.messagesPerChannel = options.messagesPerChannel ?? DEFAULT_MESSAGES;
    this.detectionWindowMs  = options.detectionWindowMs  ?? DEFAULT_DETECTION_WINDOW;
    this.running = true;

    logger.info({
      checkIntervalHours:  this.checkIntervalMs / 3_600_000,
      minCollectionHours:  this.minCollectionMs / 3_600_000,
      messagesPerChannel:  this.messagesPerChannel,
    }, "Auto-scheduler started");

    this.scheduleNext();
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.running = false;
    this.nextCheckAt = null;
    logger.info("Auto-scheduler stopped");
  }

  getStatus(): SchedulerStatus {
    return {
      running:                      this.running,
      check_interval_hours:         this.checkIntervalMs / 3_600_000,
      min_collection_interval_hours: this.minCollectionMs / 3_600_000,
      messages_per_channel:         this.messagesPerChannel,
      next_check_at:                this.nextCheckAt?.toISOString() ?? null,
      last_check_at:                this.lastCheckAt?.toISOString() ?? null,
      last_live_channels:           this.lastLive,
      currently_collecting:         Array.from(this.currentlyCollecting),
      collection_history:           this.collectionHistory.slice(-50),
      total_auto_collections:       this.collectionHistory.filter((r) => r.trigger === "auto").length,
    };
  }

  /** Немедленно запустить проверку (не сбивает расписание) */
  async runNow(): Promise<ChannelActivity[]> {
    return this.runCheck();
  }

  private scheduleNext(): void {
    this.nextCheckAt = new Date(Date.now() + this.checkIntervalMs);
    this.timer = setTimeout(() => {
      this.runCheck()
        .then(() => { if (this.running) this.scheduleNext(); })
        .catch((err) => {
          logger.error({ err }, "Scheduler check failed");
          if (this.running) this.scheduleNext();
        });
    }, this.checkIntervalMs);
    logger.info({ nextCheckAt: this.nextCheckAt.toISOString() }, "Next scheduler check scheduled");
  }

  private async runCheck(): Promise<ChannelActivity[]> {
    this.lastCheckAt = new Date();
    const channels = getPresetChannels(3);

    logger.info({ channels, windowMs: this.detectionWindowMs }, "Scheduler: running live detection");

    const results = await detectLiveChannels(channels, this.detectionWindowMs);
    const live = results.filter((r) => r.is_live).map((r) => r.channel);
    this.lastLive = live;

    logger.info({ live }, "Scheduler: live detection done");

    // Фильтруем только CS2-каналы
    const cs2Live = results.filter((r) => r.is_cs2).map((r) => r.channel);
    const nonCS2Live = results.filter((r) => r.is_live && !r.is_cs2).map((r) => `${r.channel}(${r.game_name ?? "?"})`);

    if (nonCS2Live.length > 0) {
      logger.info({ nonCS2Live }, "Scheduler: skipping non-CS2 streamers");
    }

    for (const channel of cs2Live) {
      const lastCollected = this.lastCollectedAt.get(channel) ?? 0;
      const timeSince = Date.now() - lastCollected;

      if (timeSince < this.minCollectionMs) {
        logger.info({ channel, hoursAgo: timeSince / 3_600_000 }, "Scheduler: skip — collected recently");
        continue;
      }

      if (this.currentlyCollecting.has(channel)) {
        logger.info({ channel }, "Scheduler: skip — already collecting");
        continue;
      }

      this.startCollection(channel, "auto");
    }

    return results;
  }

  private startCollection(channel: string, trigger: "auto" | "manual"): void {
    const record: CollectionRecord = {
      channel,
      started_at: new Date().toISOString(),
      finished_at: null,
      patterns_saved: null,
      trigger,
    };
    this.collectionHistory.push(record);
    this.currentlyCollecting.add(channel);

    logger.info({ channel, trigger }, "Scheduler: starting collection");

    collectPatternsFromChannel(channel, this.messagesPerChannel)
      .then((count) => {
        record.finished_at = new Date().toISOString();
        record.patterns_saved = count;
        this.lastCollectedAt.set(channel, Date.now());
        this.currentlyCollecting.delete(channel);
        logger.info({ channel, count, trigger }, "Scheduler: collection complete");
      })
      .catch((err) => {
        record.finished_at = new Date().toISOString();
        record.patterns_saved = 0;
        this.currentlyCollecting.delete(channel);
        logger.error({ err, channel, trigger }, "Scheduler: collection failed");
      });
  }
}

export const scheduler = new AutoScheduler();
