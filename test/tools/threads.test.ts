import { describe, it, expect, vi } from "vitest";
import { createThread } from "../../src/tools/threads/create-thread.js";
import { listThreads } from "../../src/tools/threads/list-threads.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockGuild,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

// --- create_thread ---

describe("create_thread", () => {
  it("has correct metadata", () => {
    expect(createThread.name).toBe("create_thread");
    expect(createThread.category).toBe("threads");
  });

  it("creates a thread in a channel", async () => {
    const ctx = createCtx();
    const result = await createThread.handle(
      { name: "test-thread", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("555555555555555555");
    expect(data.name).toBe("test-thread");
    expect(data.parent_id).toBe("222222222222222222");
    expect(data.archived).toBe(false);
  });

  it("creates a thread via project routing", async () => {
    const ctx = createCtx();
    const result = await createThread.handle(
      { name: "routed-thread", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.name).toBe("test-thread");
  });

  it("falls back to default project when no target specified", async () => {
    const ctx = createCtx();
    const result = await createThread.handle({ name: "fallback-thread" }, ctx);
    // Resolves via default_project in config
    expect(result.isError).toBeUndefined();
  });

  it("validates name length via schema", () => {
    const tooLong = createThread.inputSchema.safeParse({
      name: "a".repeat(101),
      channel_id: "222222222222222222",
    });
    expect(tooLong.success).toBe(false);
  });

  it("validates auto_archive_duration via schema", () => {
    const invalid = createThread.inputSchema.safeParse({
      name: "test",
      channel_id: "222222222222222222",
      auto_archive_duration: "999",
    });
    expect(invalid.success).toBe(false);
  });

  it("defaults auto_archive_duration to 1440", () => {
    const parsed = createThread.inputSchema.safeParse({
      name: "test",
      channel_id: "222222222222222222",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.auto_archive_duration).toBe("1440");
  });

  it("creates a thread without posting an initial message when initial_message is omitted", async () => {
    const ctx = createCtx();
    const result = await createThread.handle(
      { name: "no-msg-thread", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("555555555555555555");

    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    const createMock = mockChannel.threads.create as ReturnType<typeof vi.fn>;
    const createdThread = await createMock.mock.results[0]?.value;
    if (createdThread) {
      expect(createdThread.send).not.toHaveBeenCalled();
    }
  });

  it("posts initial_message into the thread after creation", async () => {
    const ctx = createCtx();
    const result = await createThread.handle(
      {
        name: "welcome-thread",
        channel_id: "222222222222222222",
        initial_message: "Welcome to this thread!",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("555555555555555555");

    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    const createMock = mockChannel.threads.create as ReturnType<typeof vi.fn>;
    const createdThread = await createMock.mock.results[0]?.value;
    expect(createdThread.send).toHaveBeenCalledWith({ content: "Welcome to this thread!" });
  });

  it("accepts initial_message as optional in schema", () => {
    const withMsg = createThread.inputSchema.safeParse({
      name: "test",
      channel_id: "222222222222222222",
      initial_message: "Hello!",
    });
    expect(withMsg.success).toBe(true);
    expect(withMsg.data?.initial_message).toBe("Hello!");

    const withoutMsg = createThread.inputSchema.safeParse({
      name: "test",
      channel_id: "222222222222222222",
    });
    expect(withoutMsg.success).toBe(true);
    expect(withoutMsg.data?.initial_message).toBeUndefined();
  });
});

// --- list_threads ---

describe("list_threads", () => {
  it("has correct metadata", () => {
    expect(listThreads.name).toBe("list_threads");
    expect(listThreads.category).toBe("threads");
    expect(listThreads.requiresGuild).toBe(true);
  });

  it("lists active threads in a guild", async () => {
    const ctx = createCtx();
    const result = await listThreads.handle({ guild_id: "444444444444444444" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.guild_id).toBe("444444444444444444");
    expect(data.count).toBe(0);
    expect(data.threads).toEqual([]);
  });

  it("lists threads with data", async () => {
    const mockThread = {
      id: "555555555555555555",
      name: "active-thread",
      parentId: "222222222222222222",
      parent: { name: "test-channel" },
      archived: false,
      messageCount: 10,
      memberCount: 3,
      createdAt: new Date("2026-01-15T00:00:00Z"),
    };
    const threadsMap = new Map([["555555555555555555", mockThread]]) as any;
    threadsMap.map = vi.fn().mockImplementation((fn: any) => [...threadsMap.values()].map(fn));

    const guild = createMockGuild();
    (guild.channels.fetchActiveThreads as any).mockResolvedValue({ threads: threadsMap });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await listThreads.handle({ guild_id: "444444444444444444" }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(1);
    expect(data.threads[0].id).toBe("555555555555555555");
    expect(data.threads[0].name).toBe("active-thread");
    expect(data.threads[0].parent_name).toBe("test-channel");
    expect(data.threads[0].message_count).toBe(10);
  });

  it("defaults archived to false", () => {
    const parsed = listThreads.inputSchema.safeParse({
      guild_id: "444444444444444444",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.archived).toBe(false);
  });
});
