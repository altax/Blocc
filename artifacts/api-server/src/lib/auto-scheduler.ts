import { detectLiveChannels, type ChannelActivity } from "./live-detector";
import { collectPatternsFromChannel } from "./bot-engine/pattern-learner";
import { getPresetChannels } from "./cs2-ru-streamers";
import { batchCheckGames, isCS2Game } from "./game-detector";
import {
  startSessionRecording,
  getActiveSession,
  registerStop,
} from "./session-recorder";
import { logger } from "./logger";

export interface SchedulerOptions {
  checkIntervalMs?: number;
  minCollectionIntervalMs?: number;
  messagesPerChannel?: number;
  detectionWindowMs?: number;
  /** Интервал GQL-опроса для авто-запуска записи (мс). По умолчанию 15 минут. */
  recordingPollIntervalMs?: number;
  /** Включить авто-запись сессий (по умолчанию true). */
  autoRecordEnabled?: boolean;
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
  auto_record_enabled: boolean;
  recording_poll_interval_minutes: number;
  auto_recording_channels: string[];
  last_recording_check_at: string | null;
}

export interface CollectionRecord {
  channel: string;
  started_at: string;
  finished_at: string | null;
  patterns_saved: number | null;
  trigger: "auto" | "manual";
}

const DEFAULT_CHECK_INTERVAL   = 3 * 60 * 60 * 1000;
const DEFAULT_MIN_COLLECTION   = 12 * 60 * 60 * 1000;
const DEFAULT_MESSAGES         = 300;
const DEFAULT_DETECTION_WINDOW = 30_000;
const DEFAULT_RECORDING_POLL   = 15 * 60 * 1000;  // 15 минут

class AutoScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private recordingPollTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  private checkIntervalMs      = DEFAULT_CHECK_INTERVAL;
  private minCollectionMs      = DEFAULT_MIN_COLLECTION;
  private messagesPerChannel   = DEFAULT_MESSAGES;
  private detectionWindowMs    = DEFAULT_DETECTION_WINDOW;
  private recordingPollMs      = DEFAULT_RECORDING_POLL;
  private autoRecordEnabled    = true;

  private nextCheckAt:         Date | null = null;
  private lastCheckAt:         Date | null = null;
  private lastRecordingCheckAt: Date | null = null;
  private lastLive:            string[]    = [];
  private currentlyCollecting              = new Set<string>();
  private autoRecordingChannels            = new Set<string>();
  private collectionHistory:               CollectionRecord[] = [];
  private lastCollectedAt                  = new Map<string, number>();

  start(options: SchedulerOptions = {}): void {
    if (this.running) {
      logger.info("Scheduler already running, reconfiguring");
      this.stop();
    }

    this.checkIntervalMs    = options.checkIntervalMs          ?? DEFAULT_CHECK_INTERVAL;
    this.minCollectionMs    = options.minCollectionIntervalMs  ?? DEFAULT_MIN_COLLECTION;
    this.messagesPerChannel = options.messagesPerChannel       ?? DEFAULT_MESSAGES;
    this.detectionWindowMs  = options.detectionWindowMs        ?? DEFAULT_DETECTION_WINDOW;
    this.recordingPollMs    = options.recordingPollIntervalMs  ?? DEFAULT_RECORDING_POLL;
    this.autoRecordEnabled  = options.autoRecordEnabled        ?? true;
    this.running = true;

    logger.info({
      checkIntervalHours:         this.checkIntervalMs / 3_600_000,
      minCollectionHours:         this.minCollectionMs / 3_600_000,
      messagesPerChannel:         this.messagesPerChannel,
      recordingPollMinutes:       this.recordingPollMs / 60_000,
      autoRecordEnabled:          this.autoRecordEnabled,
    }, "Auto-scheduler started");

    this.scheduleNext();

    if (this.autoRecordEnabled) {
      this.startRecordingPoller();
    }
  }

  stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.recordingPollTimer) {
      clearInterval(this.recordingPollTimer);
      this.recordingPollTimer = null;
    }
    this.running = false;
    this.nextCheckAt = null;
    logger.info("Auto-scheduler stopped");
  }

  getStatus(): SchedulerStatus {
    return {
      running:                        this.running,
      check_interval_hours:           this.checkIntervalMs / 3_600_000,
      min_collection_interval_hours:  this.minCollectionMs / 3_600_000,
      messages_per_channel:           this.messagesPerChannel,
      next_check_at:                  this.nextCheckAt?.toISOString() ?? null,
      last_check_at:                  this.lastCheckAt?.toISOString() ?? null,
      last_live_channels:             this.lastLive,
      currently_collecting:           Array.from(this.currentlyCollecting),
      collection_history:             this.collectionHistory.slice(-50),
      total_auto_collections:         this.collectionHistory.filter((r) => r.trigger === "auto").length,
      auto_record_enabled:            this.autoRecordEnabled,
      recording_poll_interval_minutes: this.recordingPollMs / 60_000,
      auto_recording_channels:        Array.from(this.autoRecordingChannels),
      last_recording_check_at:        this.lastRecordingCheckAt?.toISOString() ?? null,
    };
  }

  async runNow(): Promise<ChannelActivity[]> {
    return this.runCheck();
  }

  /** Немедленно запустить проверку для авто-записи (без ожидания следующего интервала). */
  async runRecordingCheckNow(): Promise<void> {
    return this.checkAndStartRecordings();
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

  private startRecordingPoller(): void {
    // Первая проверка сразу при старте (небольшая задержка чтобы сервер поднялся)
    setTimeout(() => {
      if (this.running && this.autoRecordEnabled) {
        this.checkAndStartRecordings().catch((err) =>
          logger.error({ err }, "Initial recording check failed")
        );
      }
    }, 10_000);

    this.recordingPollTimer = setInterval(() => {
      if (!this.running || !this.autoRecordEnabled) return;
      this.checkAndStartRecordings().catch((err) =>
        logger.error({ err }, "Recording poll check failed")
      );
    }, this.recordingPollMs);

    logger.info({ pollMinutes: this.recordingPollMs / 60_000 }, "Auto-recording poller started");
  }

  private async checkAndStartRecordings(): Promise<void> {
    this.lastRecordingCheckAt = new Date();
    const channels = getPresetChannels(3);

    logger.info({ channels }, "Recording poller: checking GQL for live CS2 channels");

    let gameMap: Map<string, { game_name: string | null; is_live: boolean }>;
    try {
      gameMap = await batchCheckGames(channels);
    } catch (err) {
      logger.error({ err }, "Recording poller: GQL check failed");
      return;
    }

    for (const channel of channels) {
      const info = gameMap.get(channel);
      if (!info?.is_live || !isCS2Game(info.game_name)) continue;

      // Уже есть активная сессия?
      const existing = getActiveSession(channel);
      if (existing) {
        this.autoRecordingChannels.add(channel);
        continue;
      }

      // Уже помечен как авто-записываемый?
      if (this.autoRecordingChannels.has(channel)) {
        // Сессия исчезла, значит она завершилась — убираем метку
        this.autoRecordingChannels.delete(channel);
        continue;
      }

      // Новый онлайн-стример без записи — стартуем!
      logger.info({ channel, game: info.game_name }, "Auto-recorder: starting session for live CS2 streamer");

      try {
        const { session, stop } = startSessionRecording(channel);
        registerStop(channel, stop);
        this.autoRecordingChannels.add(channel);
        logger.info({ channel, startedAt: session.started_at }, "Auto-recorder: session started");
      } catch (err) {
        logger.error({ err, channel }, "Auto-recorder: failed to start session");
      }
    }

    // Чистим метки для каналов которые ушли офлайн
    for (const ch of Array.from(this.autoRecordingChannels)) {
      const info = gameMap.get(ch);
      if (!info?.is_live) {
        this.autoRecordingChannels.delete(ch);
        logger.info({ channel: ch }, "Auto-recorder: channel went offline, removed from tracking");
      }
    }
  }

  private async runCheck(): Promise<ChannelActivity[]> {
    this.lastCheckAt = new Date();
    const channels = getPresetChannels(3);

    logger.info({ channels, windowMs: this.detectionWindowMs }, "Scheduler: running live detection");

    const results = await detectLiveChannels(channels, this.detectionWindowMs);
    const live = results.filter((r) => r.is_live).map((r) => r.channel);
    this.lastLive = live;

    logger.info({ live }, "Scheduler: live detection done");

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
