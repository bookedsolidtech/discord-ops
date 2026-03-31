import { Client, GatewayIntentBits, type Guild, type TextChannel } from "discord.js";
import { logger } from "./utils/logger.js";
import { validateTokenFormat } from "./security/token-validator.js";
import { TTLCache } from "./utils/cache.js";

/**
 * Lazy Discord client — tools enumerate before Discord connects.
 * First tool call triggers login + cache warmup.
 */
export class DiscordClient {
  private client: Client | null = null;
  private token: string;
  private connecting: Promise<Client> | null = null;
  private guildCache = new TTLCache<Guild>(300);

  constructor(token: string) {
    const validation = validateTokenFormat(token);
    if (!validation.valid) {
      throw new Error(`Invalid Discord token: ${validation.reason}`);
    }
    this.token = token;
  }

  /**
   * Returns the underlying discord.js Client, connecting lazily on first call.
   */
  async getClient(): Promise<Client> {
    if (this.client?.isReady()) return this.client;

    if (this.connecting) return this.connecting;

    this.connecting = this.connect();
    return this.connecting;
  }

  private async connect(): Promise<Client> {
    logger.info("Connecting to Discord...");

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

    logger.info("Discord connected", {
      user: client.user?.tag,
      guilds: client.guilds.cache.size,
    });

    this.client = client;
    this.connecting = null;
    return client;
  }

  async getGuild(guildId: string): Promise<Guild> {
    const cached = this.guildCache.get(guildId);
    if (cached) return cached;

    const client = await this.getClient();
    const guild = await client.guilds.fetch(guildId);
    this.guildCache.set(guildId, guild);
    return guild;
  }

  async getChannel(channelId: string): Promise<TextChannel> {
    const client = await this.getClient();
    const channel = await client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) {
      throw new Error(`Channel ${channelId} not found or not a text channel`);
    }
    return channel as TextChannel;
  }

  async destroy(): Promise<void> {
    if (this.client) {
      this.client.destroy();
      this.client = null;
      logger.info("Discord client destroyed");
    }
  }

  get isConnected(): boolean {
    return this.client?.isReady() ?? false;
  }
}
