import { describe, it, expect, vi } from "vitest";
import { searchMessages } from "../../src/tools/messaging/search.js";
import {
  createMockDiscordClient,
  createMockChannel,
  createMockMessage,
  createMockConfig,
} from "../mocks/discord-client.js";

function createCtx() {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig() as any,
  };
}

describe("search_messages", () => {
  it("has correct metadata", () => {
    expect(searchMessages.name).toBe("search_messages");
    expect(searchMessages.category).toBe("messaging");
  });

  it("finds matching messages", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();

    const msg1 = createMockMessage({ id: "1", content: "Hello world" });
    const msg2 = createMockMessage({ id: "2", content: "Goodbye world" });
    const msg3 = createMockMessage({ id: "3", content: "Hello again" });

    const messagesMap = new Map([
      ["1", msg1],
      ["2", msg2],
      ["3", msg3],
    ]) as any;

    mockCh.messages.fetch = vi.fn().mockResolvedValue(messagesMap);
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "Hello", limit: 50 },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.matches).toBe(2);
    expect(data.scanned).toBe(3);
  });

  it("filters by author_id", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();

    const msg1 = createMockMessage({
      id: "1",
      content: "Hello from user A",
      author: { tag: "UserA#0001", id: "111111111111111111" },
    });
    const msg2 = createMockMessage({
      id: "2",
      content: "Hello from user B",
      author: { tag: "UserB#0001", id: "222222222222222222" },
    });

    const messagesMap = new Map([
      ["1", msg1],
      ["2", msg2],
    ]) as any;

    mockCh.messages.fetch = vi.fn().mockResolvedValue(messagesMap);
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await searchMessages.handle(
      {
        channel_id: "222222222222222222",
        query: "Hello",
        author_id: "111111111111111111",
        limit: 50,
      },
      ctx,
    );

    const data = JSON.parse(result.content[0].text);
    expect(data.matches).toBe(1);
    expect(data.results[0].author_id).toBe("111111111111111111");
  });

  it("returns empty results when no match", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();

    const msg1 = createMockMessage({ id: "1", content: "Nothing here" });
    const messagesMap = new Map([["1", msg1]]) as any;

    mockCh.messages.fetch = vi.fn().mockResolvedValue(messagesMap);
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "xyz123", limit: 50 },
      ctx,
    );

    const data = JSON.parse(result.content[0].text);
    expect(data.matches).toBe(0);
    expect(data.results).toHaveLength(0);
  });

  it("supports project routing", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();

    const messagesMap = new Map() as any;

    mockCh.messages.fetch = vi.fn().mockResolvedValue(messagesMap);
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await searchMessages.handle(
      { project: "test-project", channel: "dev", query: "test", limit: 50 },
      ctx,
    );

    expect(result.isError).toBeFalsy();
  });

  it("truncates long message content", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();

    const longContent = "Hello " + "x".repeat(300);
    const msg = createMockMessage({ id: "1", content: longContent });
    const messagesMap = new Map([["1", msg]]) as any;

    mockCh.messages.fetch = vi.fn().mockResolvedValue(messagesMap);
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "Hello", limit: 50 },
      ctx,
    );

    const data = JSON.parse(result.content[0].text);
    expect(data.results[0].content.length).toBeLessThanOrEqual(203); // 200 + "..."
  });
});
