import * as net from "net";
import { logger } from "../logger";

export interface TwitchIrcOptions {
  username: string;
  oauthToken: string;
  channel: string;
  onMessage?: (username: string, message: string) => void;
  onConnected?: () => void;
  onDisconnected?: () => void;
}

export class TwitchIrcClient {
  private socket: net.Socket | null = null;
  private options: TwitchIrcOptions;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private buffer = "";

  constructor(options: TwitchIrcOptions) {
    this.options = options;
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new net.Socket();

      this.socket.connect(6667, "irc.chat.twitch.tv", () => {
        this.socket!.write(`PASS oauth:${this.options.oauthToken}\r\n`);
        this.socket!.write(`NICK ${this.options.username}\r\n`);
        this.socket!.write(`CAP REQ :twitch.tv/membership twitch.tv/tags twitch.tv/commands\r\n`);
        this.socket!.write(`JOIN #${this.options.channel.toLowerCase()}\r\n`);
      });

      this.socket.on("data", (data) => {
        this.buffer += data.toString();
        const lines = this.buffer.split("\r\n");
        this.buffer = lines.pop() ?? "";

        for (const line of lines) {
          this.handleLine(line);
          if (line.includes(`JOIN #${this.options.channel.toLowerCase()}`)) {
            this.connected = true;
            this.startPing();
            this.options.onConnected?.();
            resolve();
          }
        }
      });

      this.socket.on("error", (err) => {
        logger.error({ err }, "Twitch IRC error");
        if (!this.connected) reject(err);
        this.scheduleReconnect();
      });

      this.socket.on("close", () => {
        this.connected = false;
        this.options.onDisconnected?.();
        this.scheduleReconnect();
      });

      setTimeout(() => {
        if (!this.connected) reject(new Error("IRC connection timeout"));
      }, 15000);
    });
  }

  private handleLine(line: string): void {
    if (line.startsWith("PING")) {
      this.socket?.write(`PONG${line.slice(4)}\r\n`);
      return;
    }

    const privmsgMatch = line.match(/:(\w+)!\w+@\w+\.tmi\.twitch\.tv PRIVMSG #\w+ :(.+)/);
    if (privmsgMatch) {
      const [, username, message] = privmsgMatch;
      this.options.onMessage?.(username, message);
    }
  }

  sendMessage(message: string): void {
    if (!this.connected || !this.socket) {
      logger.warn("Cannot send message: not connected to IRC");
      return;
    }
    this.socket.write(`PRIVMSG #${this.options.channel.toLowerCase()} :${message}\r\n`);
    logger.info({ channel: this.options.channel, message }, "Sent IRC message");
  }

  private startPing(): void {
    this.pingTimer = setInterval(() => {
      this.socket?.write("PING :tmi.twitch.tv\r\n");
    }, 60000);
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      logger.info("Reconnecting to Twitch IRC...");
      this.connect().catch((err) => logger.error({ err }, "Reconnect failed"));
    }, 5000);
  }

  disconnect(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}
