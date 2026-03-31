import { Client, GatewayIntentBits, type Guild, type TextChannel } from "discord.js";
import { logger } from "./utils/logger.js";
import { validateTokenFormat } from "./security/token-validator.js";
import { TTLCache } from "./utils/cache.js";

/**
 * Single Discord bot connection — lazy login on first use.
 */
class BotConnection {
  private client: Client | null = null;
  private connecting: Promise<Client> | null = null;
  private token: string;

  constructor(token: string) {
    this.token = token;
  }

  async getClient(): Promise<Client> {
    if (this.client?.isReady()) return this.client;
    if (this.connecting) return this.connecting;
    this.connecting = this.connect();
    return this.connecting;
  }

  private async connect(): Promise<Client> {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
      ],
    });

    await client.login(this.token);

    await new Promise<void>((resolve) => {
      if (client.isReady()) {
        resolve();
      } else {
        client.once("ready", () => resolve());
      }
    });

    logger.info("Discord bot connected", {
      user: client.user?.tag,
      guilds: client.guilds.cache.size,
    });

    this.client = client;
    this.connecting = null;
    return client;
  }

  get isReady(): boolean {
    return this.client?.isReady() ?? false;
  }

  async destroy(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
}

/**
 * Multi-bot Discord client manager.
 * Manages one lazy connection per unique token.
 * Tools call getChannel/getGuild with an optional token override
 * to route to the correct bot.
 */
export class DiscordClient {
  private connections = new Map<string, BotConnection>();
  private defaultToken: string;
  private guildCache = new TTLCache<Guild>(300);

  constructor(defaultToken: string) {
    const validation = validateTokenFormat(defaultToken);
    if (!validation.valid) {
      throw new Error(`Invalid Discord token: ${validation.reason}`);
    }
    this.defaultToken = defaultToken;
  }

  private getConnection(token?: string): BotConnection {
    const t = token ?? this.defaultToken;
    let conn = this.connections.get(t);
    if (!conn) {
      if (t !== this.defaultToken) {
        const validation = validateTokenFormat(t);
        if (!validation.valid) {
          throw new Error(`Invalid Discord token for project: ${validation.reason}`);
        }
      }
      conn = new BotConnection(t);
      this.connections.set(t, conn);
    }
    return conn;
  }

  /**
   * Returns the underlying discord.js Client for the given token.
   * Connects lazily on first call.
   */
  async getClient(token?: string): Promise<Client> {
    return this.getConnection(token).getClient();
  }

  async getGuild(guildId: string, token?: string): Promise<Guild> {
    const cacheKey = `${token ?? "default"}:${guildId}`;
    const cached = this.guildCache.get(cacheKey);
    if (cached) return cached;

    const client = await this.getClient(token);
    const guild = await client.guilds.fetch(guildId);
    this.guildCache.set(cacheKey, guild);
    return guild;
  }

  async getChannel(channelId: string, token?: string): Promise<TextChannel> {
    const client = await this.getClient(token);
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} not found or not a text channel`);
    }
    return channel as TextChannel;
  }

  async destroy(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.destroy();
    }
    this.connections.clear();
    logger.info("All Discord connections destroyed");
  }

  get isConnected(): boolean {
    return this.getConnection().isReady;
  }
}
