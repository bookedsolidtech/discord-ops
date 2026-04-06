import {
  Client,
  GatewayIntentBits,
  type Guild,
  type GuildChannel,
  type TextChannel,
  type ThreadChannel,
} from "discord.js";
import { logger } from "./utils/logger.js";
import { validateTokenFormat } from "./security/token-validator.js";
import { TTLCache } from "./utils/cache.js";
import { fuzzyFind } from "./routing/fuzzy.js";

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
    // Clear `connecting` on failure so the next call retries instead of returning
    // a permanently rejected promise (BotConnection permanent rejection fix).
    this.connecting = this.connect().catch((err: unknown) => {
      this.connecting = null;
      throw err;
    });
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
  private defaultToken?: string;
  private guildCache = new TTLCache<Guild>(300);
  private channelCache = new TTLCache<TextChannel | ThreadChannel>(60);

  constructor(defaultToken?: string) {
    if (defaultToken) {
      const validation = validateTokenFormat(defaultToken);
      if (!validation.valid) {
        throw new Error(`Invalid Discord token: ${validation.reason}`);
      }
    }
    this.defaultToken = defaultToken;
  }

  private getConnection(token?: string): BotConnection {
    const t = token ?? this.defaultToken;
    if (!t) {
      throw new Error(
        "No Discord token available. Set DISCORD_TOKEN, DISCORD_OPS_TOKEN_ENV, or use per-project token_env.",
      );
    }
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

  async getChannel(channelId: string, token?: string): Promise<TextChannel | ThreadChannel> {
    const cacheKey = `${token ?? "default"}:${channelId}`;
    const cached = this.channelCache.get(cacheKey);
    if (cached) return cached;

    const client = await this.getClient(token);
    let channel: TextChannel | ThreadChannel;
    try {
      const fetched = await client.channels.fetch(channelId);
      if (!fetched || !fetched.isTextBased()) {
        throw new Error(`Channel ${channelId} not found or not a text channel`);
      }
      channel = fetched as TextChannel | ThreadChannel;
    } catch (err: unknown) {
      if (
        err !== null &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: unknown }).code === 10003
      ) {
        this.channelCache.delete(cacheKey);
      }
      throw err;
    }

    this.channelCache.set(cacheKey, channel);
    return channel;
  }

  async getAnyChannel(
    channelIdOrName: string,
    token?: string,
    guildId?: string,
  ): Promise<GuildChannel> {
    const resolvedId = /^\d{17,20}$/.test(channelIdOrName)
      ? channelIdOrName
      : await this.resolveChannelName(channelIdOrName, token, guildId);
    const client = await this.getClient(token);
    const channel = await client.channels.fetch(resolvedId);
    if (!channel || !("guild" in channel)) {
      throw new Error(`Channel "${channelIdOrName}" not found or not a guild channel`);
    }
    return channel as GuildChannel;
  }

  private async resolveChannelName(
    name: string,
    token?: string,
    guildId?: string,
  ): Promise<string> {
    if (guildId) {
      const id = await this.findChannelByName(guildId, name, token);
      if (!id) throw new Error(`Channel "${name}" not found in guild ${guildId}`);
      return id;
    }
    // No guild context — search across all cached guilds
    const client = await this.getClient(token);
    for (const guild of client.guilds.cache.values()) {
      const id = await this.findChannelByName(guild.id, name, token);
      if (id) return id;
    }
    throw new Error(`Channel "${name}" not found — provide guild_id for reliable name resolution`);
  }

  /**
   * Find a text channel in a guild by name using fuzzy matching.
   * Returns the channel ID if found, undefined otherwise.
   */
  async findChannelByName(
    guildId: string,
    name: string,
    token?: string,
  ): Promise<string | undefined> {
    const guild = await this.getGuild(guildId, token);
    const channels = await guild.channels.fetch();
    const textChannels = channels
      .filter((c) => c !== null && c.isTextBased())
      .map((c) => ({ id: c!.id, name: c!.name }));
    const match = fuzzyFind(textChannels, name);
    return match?.item.id;
  }

  async destroy(): Promise<void> {
    for (const conn of this.connections.values()) {
      await conn.destroy();
    }
    this.connections.clear();
    logger.info("All Discord connections destroyed");
  }

  get isConnected(): boolean {
    if (!this.defaultToken) return false;
    return this.getConnection().isReady;
  }
}
