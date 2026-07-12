import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MessageType, type Client } from "discord.js";
import {
  attachListeners,
  buildTokenChannelMap,
  createChannelResolver,
  normalizeMessageEvent,
  normalizeReactionEvent,
  normalizeThreadEvent,
  type ChannelRoute,
} from "../../src/cli/listen.js";
import {
  readLastSeq,
  readSinkFile,
  rotatedPath,
  SinkWriter,
  type SinkEvent,
} from "../../src/utils/event-sink.js";
import { ListenConfigSchema } from "../../src/config/schema.js";
import type { LoadedConfig } from "../../src/config/index.js";

const route: ChannelRoute = { project: "alpha", channel: "dev" };

function createMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: "500000000000000001",
    channelId: "111111111111111111",
    guildId: "900000000000000001",
    content: "hello from an agent",
    type: MessageType.Default,
    author: { tag: "AgentBot#0001", id: "600000000000000001", bot: true },
    reference: null,
    createdAt: new Date("2026-07-12T10:00:00.000Z"),
    channel: { parentId: null },
    ...overrides,
  };
}

describe("normalizeMessageEvent", () => {
  it("maps message_create fields including project/alias reverse-mapping", () => {
    const event = normalizeMessageEvent("message_create", createMessage(), route);

    expect(event).toMatchObject({
      type: "message_create",
      project: "alpha",
      channel: "dev",
      channel_id: "111111111111111111",
      guild_id: "900000000000000001",
      message_id: "500000000000000001",
      author: "AgentBot#0001",
      author_bot: true,
      content: "hello from an agent",
      reply_to: null,
      ts: "2026-07-12T10:00:00.000Z",
    });
    expect(event).not.toHaveProperty("seq");
    expect(event.emoji).toBeUndefined();
  });

  it("sets reply_to for true user replies", () => {
    const event = normalizeMessageEvent(
      "message_create",
      createMessage({
        type: MessageType.Reply,
        reference: { messageId: "500000000000000000" },
      }),
      route,
    );

    expect(event.reply_to).toBe("500000000000000000");
  });

  it("leaves reply_to null for system pin messages despite a message_reference", () => {
    const event = normalizeMessageEvent(
      "message_create",
      createMessage({
        type: MessageType.ChannelPinnedMessage,
        reference: { messageId: "500000000000000000" },
      }),
      route,
    );

    expect(event.reply_to).toBeNull();
  });

  it("omits absent fields from the serialized JSONL line (partial message_delete)", () => {
    const event = normalizeMessageEvent(
      "message_delete",
      createMessage({ content: null, author: null }),
      route,
    );

    const line = JSON.parse(JSON.stringify(event));
    expect(line).not.toHaveProperty("content");
    expect(line).not.toHaveProperty("author");
    expect(line).not.toHaveProperty("emoji");
    expect(line.message_id).toBe("500000000000000001");
  });
});

describe("normalizeReactionEvent", () => {
  it("maps reaction fields with emoji and no content", () => {
    const event = normalizeReactionEvent(
      "reaction_add",
      {
        message: {
          id: "500000000000000001",
          channelId: "111111111111111111",
          guildId: "900000000000000001",
        },
        emoji: { toString: () => "✅" },
      },
      { tag: "Human#0001", id: "700000000000000001", bot: false },
      route,
    );

    expect(event).toMatchObject({
      type: "reaction_add",
      project: "alpha",
      channel: "dev",
      channel_id: "111111111111111111",
      message_id: "500000000000000001",
      author: "Human#0001",
      author_bot: false,
      emoji: "✅",
    });
    expect(event.content).toBeUndefined();
    expect(event).not.toHaveProperty("reply_to");
  });
});

describe("normalizeThreadEvent", () => {
  it("routes threads by parent channel with the thread ID as message_id", () => {
    const event = normalizeThreadEvent(
      {
        id: "550000000000000001",
        parentId: "111111111111111111",
        guildId: "900000000000000001",
      },
      route,
    );

    expect(event).toMatchObject({
      type: "thread_create",
      channel_id: "111111111111111111",
      message_id: "550000000000000001",
      project: "alpha",
      channel: "dev",
    });
    expect(event.content).toBeUndefined();
    expect(event.emoji).toBeUndefined();
  });
});

function createListenConfig(overrides: Record<string, unknown> = {}) {
  return ListenConfigSchema.parse(overrides);
}

function createLoadedConfig(): LoadedConfig {
  return {
    defaultToken: "placeholder-default-token",
    global: {
      bots: {
        scout: { name: "Scout", token_env: "LISTEN_TEST_SCOUT_TOKEN" },
      },
      projects: {
        alpha: {
          guild_id: "900000000000000001",
          channels: {
            dev: "111111111111111111",
            builds: { id: "222222222222222222", bot: "scout" },
          },
        },
        beta: {
          guild_id: "900000000000000002",
          channels: {
            ops: "333333333333333333",
          },
        },
      },
    },
  } as unknown as LoadedConfig;
}

describe("buildTokenChannelMap", () => {
  afterEach(() => {
    delete process.env.LISTEN_TEST_SCOUT_TOKEN;
  });

  it("maps all configured channels under the default token by default", () => {
    process.env.LISTEN_TEST_SCOUT_TOKEN = "placeholder-scout-token";
    const byToken = buildTokenChannelMap(createLoadedConfig(), createListenConfig());

    const defaults = byToken.get("placeholder-default-token")!;
    expect(defaults.get("111111111111111111")).toEqual({ project: "alpha", channel: "dev" });
    expect(defaults.get("333333333333333333")).toEqual({ project: "beta", channel: "ops" });
  });

  it("groups channel-level bot overrides under the bot token (one connection per token)", () => {
    process.env.LISTEN_TEST_SCOUT_TOKEN = "placeholder-scout-token";
    const byToken = buildTokenChannelMap(createLoadedConfig(), createListenConfig());

    expect(byToken.size).toBe(2);
    const scout = byToken.get("placeholder-scout-token")!;
    expect(scout.get("222222222222222222")).toEqual({ project: "alpha", channel: "builds" });
    expect(byToken.get("placeholder-default-token")!.has("222222222222222222")).toBe(false);
  });

  it("applies the listen.channels allowlist by alias and by snowflake ID", () => {
    process.env.LISTEN_TEST_SCOUT_TOKEN = "placeholder-scout-token";
    const byToken = buildTokenChannelMap(
      createLoadedConfig(),
      createListenConfig({ channels: ["dev", "333333333333333333"] }),
    );

    const defaults = byToken.get("placeholder-default-token")!;
    expect(defaults.has("111111111111111111")).toBe(true);
    expect(defaults.has("333333333333333333")).toBe(true);
    expect(byToken.has("placeholder-scout-token")).toBe(false);
  });

  it("skips channels whose bot token env var is not set", () => {
    const byToken = buildTokenChannelMap(createLoadedConfig(), createListenConfig());

    expect(byToken.has("placeholder-scout-token")).toBe(false);
    const defaults = byToken.get("placeholder-default-token")!;
    expect(defaults.has("111111111111111111")).toBe(true);
    expect(defaults.has("222222222222222222")).toBe(false);
  });
});

describe("createChannelResolver", () => {
  const resolve = createChannelResolver(
    new Map([["111111111111111111", { project: "alpha", channel: "dev" }]]),
  );

  it("resolves configured channels and drops unconfigured ones", () => {
    expect(resolve("111111111111111111")).toEqual({ project: "alpha", channel: "dev" });
    expect(resolve("999999999999999999")).toBeUndefined();
  });

  it("resolves threads via their parent channel", () => {
    expect(resolve("555555555555555555", "111111111111111111")).toEqual({
      project: "alpha",
      channel: "dev",
    });
    expect(resolve("555555555555555555", "999999999999999999")).toBeUndefined();
  });
});

describe("SinkWriter", () => {
  let dir: string;
  let sink: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "discord-ops-sink-"));
    sink = join(dir, "events.jsonl");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function sampleEvent(overrides: Partial<SinkEvent> = {}): Omit<SinkEvent, "seq"> {
    return {
      type: "message_create",
      project: "alpha",
      channel: "dev",
      channel_id: "111111111111111111",
      guild_id: "900000000000000001",
      message_id: "500000000000000001",
      author: "AgentBot#0001",
      author_bot: true,
      content: "hello",
      reply_to: null,
      ts: "2026-07-12T10:00:00.000Z",
      ...overrides,
    };
  }

  it("starts seq at 1 on a fresh sink and increments monotonically", () => {
    const writer = new SinkWriter({ path: sink });

    expect(writer.append(sampleEvent()).seq).toBe(1);
    expect(writer.append(sampleEvent()).seq).toBe(2);
    expect(writer.append(sampleEvent()).seq).toBe(3);

    const seqs = readSinkFile(sink).map((e) => e.seq);
    expect(seqs).toEqual([1, 2, 3]);
  });

  it("resumes seq from an existing sink, skipping a torn trailing line", () => {
    writeFileSync(
      sink,
      [1, 2, 3].map((seq) => JSON.stringify({ ...sampleEvent(), seq })).join("\n") +
        "\n" +
        '{"seq":4,"type":"message_cr', // torn write from a crashed sidecar
    );

    expect(readLastSeq(sink)).toBe(3);
    const writer = new SinkWriter({ path: sink });
    expect(writer.append(sampleEvent()).seq).toBe(4);
  });

  it("resumes seq from the rotated file when the active sink is empty", () => {
    writeFileSync(rotatedPath(sink), JSON.stringify({ ...sampleEvent(), seq: 7 }) + "\n");
    writeFileSync(sink, "");

    const writer = new SinkWriter({ path: sink });
    expect(writer.append(sampleEvent()).seq).toBe(8);
  });

  it("rotates to <sink>.1 once maxBytes is exceeded, keeping seq monotonic", () => {
    const writer = new SinkWriter({ path: sink, maxBytes: 600 });
    const padded = sampleEvent({ content: "x".repeat(120) }); // each line ~350 bytes

    writer.append(padded); // ~350 bytes — under threshold
    writer.append(padded); // ~700 bytes — rotates after append
    expect(existsSync(rotatedPath(sink))).toBe(true);
    expect(readSinkFile(rotatedPath(sink)).map((e) => e.seq)).toEqual([1, 2]);
    expect(readFileSync(sink, "utf-8")).toBe("");

    writer.append(padded);
    expect(readSinkFile(sink).map((e) => e.seq)).toEqual([3]);

    // A restarted sidecar resumes from the active sink after rotation.
    const resumed = new SinkWriter({ path: sink, maxBytes: 600 });
    expect(resumed.append(sampleEvent()).seq).toBe(4);
  });

  it("echoes each JSONL line when echo is provided (--stdout)", () => {
    const lines: string[] = [];
    const writer = new SinkWriter({ path: sink, echo: { write: (l: string) => lines.push(l) } });

    writer.append(sampleEvent());
    writer.append(sampleEvent());

    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).seq).toBe(1);
    expect(lines[0].endsWith("\n")).toBe(true);
  });
});

describe("attachListeners", () => {
  let dir: string;
  let sink: string;
  let writer: SinkWriter;

  const resolve = createChannelResolver(
    new Map([["111111111111111111", { project: "alpha", channel: "dev" }]]),
  );

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "discord-ops-listen-"));
    sink = join(dir, "events.jsonl");
    writer = new SinkWriter({ path: sink });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function createFakeClient(): Client {
    return new EventEmitter() as unknown as Client;
  }

  it("forwards message_create for configured channels with monotonic seq", () => {
    const client = createFakeClient();
    attachListeners(client, { events: new Set(["message_create"]), resolve, writer });

    (client as unknown as EventEmitter).emit("messageCreate", createMessage());
    (client as unknown as EventEmitter).emit(
      "messageCreate",
      createMessage({ id: "500000000000000002" }),
    );

    const events = readSinkFile(sink);
    expect(events.map((e) => e.seq)).toEqual([1, 2]);
    expect(events[0]).toMatchObject({
      type: "message_create",
      project: "alpha",
      channel: "dev",
      content: "hello from an agent",
    });
  });

  it("drops events for channels not present in the config", () => {
    const client = createFakeClient();
    attachListeners(client, { events: new Set(["message_create"]), resolve, writer });

    (client as unknown as EventEmitter).emit(
      "messageCreate",
      createMessage({ channelId: "999999999999999999" }),
    );

    expect(readSinkFile(sink)).toHaveLength(0);
  });

  it("does not subscribe event types absent from the config", () => {
    const client = createFakeClient();
    attachListeners(client, { events: new Set(["message_create"]), resolve, writer });

    (client as unknown as EventEmitter).emit("messageUpdate", createMessage(), createMessage());

    expect(readSinkFile(sink)).toHaveLength(0);
  });

  it("forwards reaction_add with the reacting user and emoji", () => {
    const client = createFakeClient();
    attachListeners(client, { events: new Set(["reaction_add"]), resolve, writer });

    (client as unknown as EventEmitter).emit(
      "messageReactionAdd",
      {
        message: {
          id: "500000000000000001",
          channelId: "111111111111111111",
          guildId: "900000000000000001",
          channel: { parentId: null },
        },
        emoji: { toString: () => "🚀" },
      },
      { tag: "Human#0001", id: "700000000000000001", bot: false },
    );

    const events = readSinkFile(sink);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: "reaction_add", emoji: "🚀", author: "Human#0001" });
  });

  it("routes thread messages to their configured parent channel", () => {
    const client = createFakeClient();
    attachListeners(client, { events: new Set(["message_create"]), resolve, writer });

    (client as unknown as EventEmitter).emit(
      "messageCreate",
      createMessage({
        channelId: "555555555555555555", // thread — not in config
        channel: { parentId: "111111111111111111" },
      }),
    );

    const events = readSinkFile(sink);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ project: "alpha", channel: "dev" });
  });
});
