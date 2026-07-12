import { Client, Events, GatewayIntentBits, MessageType, Options, Partials } from "discord.js";
import { loadConfig, getTokenForChannel, type LoadedConfig } from "../config/index.js";
import type { ListenConfig, ListenEventType } from "../config/schema.js";
import { resolveListenConfig, SinkWriter, type SinkEvent } from "../utils/event-sink.js";
import { logger, setLogLevel, type LogLevel } from "../utils/logger.js";

/**
 * `discord-ops listen` — gateway listener sidecar for the agent coordination
 * bus. Opens one gateway connection per unique bot token in the config and
 * appends normalized events to a local JSONL sink that the `get_events` tool
 * reads with zero Discord API calls per poll.
 */

/** Heartbeat interval — bumps sink mtime so get_events can detect a live sidecar. */
const HEARTBEAT_MS = 60_000;

export const LISTEN_INTENTS = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.MessageContent,
] as const;

/** Where a channel routes in the config: owning project + alias. */
export interface ChannelRoute {
  project: string;
  channel: string;
}

/** Resolves a channel (or its thread parent) to a route; undefined = filtered out. */
export type ChannelResolver = (
  channelId: string,
  parentId?: string | null,
) => ChannelRoute | undefined;

/**
 * Maps every configured channel to the token whose bot owns it
 * (channel-level bot override → project token → default token), applying the
 * optional `listen.channels` allowlist (aliases or snowflake IDs).
 *
 * Grouping by token means each channel is watched by exactly one gateway
 * connection — bots sharing a guild do not produce duplicate events.
 */
export function buildTokenChannelMap(
  config: LoadedConfig,
  listen: ListenConfig,
): Map<string, Map<string, ChannelRoute>> {
  const allowlist =
    listen.channels && listen.channels.length > 0 ? new Set(listen.channels) : undefined;
  const byToken = new Map<string, Map<string, ChannelRoute>>();

  for (const [projectName, project] of Object.entries(config.global.projects)) {
    for (const [alias, value] of Object.entries(project.channels)) {
      const id = typeof value === "string" ? value : value.id;
      if (allowlist && !allowlist.has(alias) && !allowlist.has(id)) continue;

      let token: string;
      try {
        token = getTokenForChannel(projectName, alias, config);
      } catch (err) {
        logger.warn(`Skipping channel "${projectName}/${alias}" — no token available`, {
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }

      let channels = byToken.get(token);
      if (!channels) {
        channels = new Map();
        byToken.set(token, channels);
      }
      if (!channels.has(id)) channels.set(id, { project: projectName, channel: alias });
    }
  }

  return byToken;
}

/** Builds the per-connection channel filter: configured channels pass, everything else drops. */
export function createChannelResolver(channels: Map<string, ChannelRoute>): ChannelResolver {
  return (channelId, parentId) =>
    channels.get(channelId) ?? (parentId ? channels.get(parentId) : undefined);
}

/** Structural subset of discord.js Message consumed by the normalizer. */
export interface MessageLike {
  id: string;
  channelId: string;
  guildId?: string | null;
  content?: string | null;
  type?: number | null;
  author?: { tag?: string | null; id?: string; bot?: boolean | null } | null;
  reference?: { messageId?: string | null } | null;
  createdAt?: Date | null;
}

export type MessageEventType = "message_create" | "message_update" | "message_delete";

/**
 * Normalizes a gateway message event for the sink. `content` is only present
 * on message events; `reply_to` is gated on MessageType.Reply — Discord also
 * sets message_reference on system messages (pin notifications, thread
 * starters, crossposts), which are not replies.
 */
export function normalizeMessageEvent(
  type: MessageEventType,
  msg: MessageLike,
  route: ChannelRoute,
): Omit<SinkEvent, "seq"> {
  return {
    type,
    project: route.project,
    channel: route.channel,
    channel_id: msg.channelId,
    guild_id: msg.guildId ?? undefined,
    message_id: msg.id,
    author: msg.author?.tag ?? msg.author?.id ?? undefined,
    author_bot: msg.author?.bot ?? undefined,
    content: msg.content ?? undefined,
    reply_to: msg.type === MessageType.Reply ? (msg.reference?.messageId ?? null) : null,
    ts: msg.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

/** Structural subset of discord.js MessageReaction consumed by the normalizer. */
export interface ReactionLike {
  message: { id: string; channelId: string; guildId?: string | null };
  emoji: { toString(): string };
}

export interface ReactionUserLike {
  tag?: string | null;
  id?: string;
  bot?: boolean | null;
}

/** Normalizes a reaction event — `emoji` is round-trippable into add_reaction. */
export function normalizeReactionEvent(
  type: "reaction_add" | "reaction_remove",
  reaction: ReactionLike,
  user: ReactionUserLike | null,
  route: ChannelRoute,
): Omit<SinkEvent, "seq"> {
  return {
    type,
    project: route.project,
    channel: route.channel,
    channel_id: reaction.message.channelId,
    guild_id: reaction.message.guildId ?? undefined,
    message_id: reaction.message.id,
    author: user?.tag ?? user?.id ?? undefined,
    author_bot: user?.bot ?? undefined,
    emoji: reaction.emoji.toString(),
    ts: new Date().toISOString(),
  };
}

/** Structural subset of discord.js ThreadChannel consumed by the normalizer. */
export interface ThreadLike {
  id: string;
  parentId?: string | null;
  guildId?: string | null;
}

/**
 * Normalizes a thread_create event. Threads route by their parent channel;
 * `message_id` carries the thread ID (equal to the starter message ID for
 * message-spawned threads).
 */
export function normalizeThreadEvent(
  thread: ThreadLike,
  route: ChannelRoute,
): Omit<SinkEvent, "seq"> {
  return {
    type: "thread_create",
    project: route.project,
    channel: route.channel,
    channel_id: thread.parentId ?? thread.id,
    guild_id: thread.guildId ?? undefined,
    message_id: thread.id,
    ts: new Date().toISOString(),
  };
}

/**
 * Creates a memory-lean gateway client. The sidecar only forwards events —
 * it never reads back — so every high-volume cache is zeroed. Partials are
 * required: with the message cache disabled, reaction events for uncached
 * messages would otherwise be dropped entirely.
 */
export function createListenerClient(): Client {
  return new Client({
    intents: [...LISTEN_INTENTS],
    partials: [Partials.Message, Partials.Reaction, Partials.User],
    makeCache: Options.cacheWithLimits({
      ...Options.DefaultMakeCacheSettings,
      MessageManager: 0,
      GuildMemberManager: 0,
      UserManager: 0,
      ReactionManager: 0,
      ReactionUserManager: 0,
      PresenceManager: 0,
      ThreadMemberManager: 0,
      GuildEmojiManager: 0,
      GuildStickerManager: 0,
      GuildScheduledEventManager: 0,
      VoiceStateManager: 0,
      GuildBanManager: 0,
      GuildInviteManager: 0,
      StageInstanceManager: 0,
      AutoModerationRuleManager: 0,
    }),
  });
}

interface ListenerDeps {
  events: Set<ListenEventType>;
  resolve: ChannelResolver;
  writer: SinkWriter;
}

/** Subscribes the configured gateway events, filtering to configured channels. */
export function attachListeners(client: Client, deps: ListenerDeps): void {
  const { events, resolve, writer } = deps;

  const forward = (event: Omit<SinkEvent, "seq">): void => {
    try {
      writer.append(event);
    } catch (err) {
      logger.error("Failed to append event to sink", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Thread messages carry the thread ID as channelId — the parent channel ID
  // is what the config knows. Narrowed at runtime: DM channels have no parentId.
  const parentOf = (msg: { channel?: object | null }): string | null => {
    const ch = msg.channel;
    if (ch && "parentId" in ch) {
      return (ch as { parentId?: string | null }).parentId ?? null;
    }
    return null;
  };

  if (events.has("message_create")) {
    client.on(Events.MessageCreate, (msg) => {
      const route = resolve(msg.channelId, parentOf(msg));
      if (!route) return;
      forward(normalizeMessageEvent("message_create", msg, route));
    });
  }

  if (events.has("message_update")) {
    client.on(Events.MessageUpdate, (_old, msg) => {
      const route = resolve(msg.channelId, parentOf(msg));
      if (!route) return;
      forward(normalizeMessageEvent("message_update", msg, route));
    });
  }

  if (events.has("message_delete")) {
    client.on(Events.MessageDelete, (msg) => {
      const route = resolve(msg.channelId, parentOf(msg));
      if (!route) return;
      // Deleted messages arrive partial — content/author may be absent.
      forward(normalizeMessageEvent("message_delete", msg, route));
    });
  }

  if (events.has("reaction_add")) {
    client.on(Events.MessageReactionAdd, (reaction, user) => {
      const route = resolve(reaction.message.channelId, parentOf(reaction.message));
      if (!route) return;
      forward(normalizeReactionEvent("reaction_add", reaction, user, route));
    });
  }

  if (events.has("reaction_remove")) {
    client.on(Events.MessageReactionRemove, (reaction, user) => {
      const route = resolve(reaction.message.channelId, parentOf(reaction.message));
      if (!route) return;
      forward(normalizeReactionEvent("reaction_remove", reaction, user, route));
    });
  }

  if (events.has("thread_create")) {
    client.on(Events.ThreadCreate, (thread) => {
      const route = resolve(thread.parentId ?? thread.id, null);
      if (!route) return;
      forward(normalizeThreadEvent(thread, route));
    });
  }

  client.on(Events.Error, (err) => {
    logger.error("Gateway error", { error: err.message });
  });
}

/**
 * Entry point for the `listen` subcommand. Dispatched before the global flag
 * validator, so it validates its own flags (`--stdout`).
 */
export async function runListen(args: string[]): Promise<void> {
  for (const arg of args) {
    if (arg === "--") break;
    if (arg.startsWith("--") && arg !== "--stdout") {
      console.error(`Unknown flag for listen: ${arg}. Valid flags: --stdout`);
      process.exit(1);
    }
  }
  const echoStdout = args.includes("--stdout");

  const logLevel = process.env.DISCORD_OPS_LOG_LEVEL as LogLevel | undefined;
  if (logLevel) setLogLevel(logLevel);

  const config = loadConfig();
  const listenCfg = resolveListenConfig(config);
  const events = new Set<ListenEventType>(listenCfg.events);

  const byToken = buildTokenChannelMap(config, listenCfg);
  if (byToken.size === 0) {
    console.error(
      "No channels to listen on — configure projects with channels (and tokens) in ~/.discord-ops.json",
    );
    process.exit(1);
  }

  const writer = new SinkWriter({
    path: listenCfg.sink,
    echo: echoStdout ? process.stdout : undefined,
  });

  logger.info("Starting gateway listener", {
    sink: listenCfg.sink,
    events: [...events],
    bots: byToken.size,
    resume_seq: writer.lastSeq,
  });

  const clients: Client[] = [];
  for (const [token, channels] of byToken) {
    const client = createListenerClient();
    attachListeners(client, { events, resolve: createChannelResolver(channels), writer });
    client.once(Events.ClientReady, (ready) => {
      logger.info("Listener connected", { user: ready.user.tag, channels: channels.size });
    });
    try {
      await client.login(token);
      clients.push(client);
    } catch (err) {
      logger.error("Listener login failed for one bot — continuing with the rest", {
        error: err instanceof Error ? err.message : String(err),
        channels: channels.size,
      });
      void client.destroy();
    }
  }

  if (clients.length === 0) {
    console.error("All gateway logins failed — check bot tokens.");
    process.exit(1);
  }

  // Heartbeat: bump sink mtime so get_events reports sink_active during quiet periods.
  const heartbeat = setInterval(() => writer.touch(), HEARTBEAT_MS);

  const shutdown = async (): Promise<void> => {
    logger.info("Shutting down listener...");
    clearInterval(heartbeat);
    await Promise.all(clients.map((c) => c.destroy()));
    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}
