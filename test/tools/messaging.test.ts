import { describe, it, expect, vi, afterEach } from "vitest";
import { sendMessage } from "../../src/tools/messaging/send-message.js";
import { sendEmbed } from "../../src/tools/messaging/send-embed.js";
import { getMessages } from "../../src/tools/messaging/get-messages.js";
import { editMessage } from "../../src/tools/messaging/edit-message.js";
import { deleteMessage } from "../../src/tools/messaging/delete-message.js";
import { addReaction } from "../../src/tools/messaging/add-reaction.js";
import { searchMessages } from "../../src/tools/messaging/search.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMessage,
  createMockChannel,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

vi.mock("../../src/utils/og-fetch.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/utils/og-fetch.js")>();
  return {
    ...actual,
    fetchOgMetadata: vi.fn().mockResolvedValue({}),
  };
});

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

describe("send_message", () => {
  it("sends a message via project routing", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Hello world", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything());
  });

  it("sends a message via direct channel_id", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Direct", channel_id: "999999999999999999" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("999999999999999999", undefined);
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createCtx();
    ctx.config.global.default_project = undefined;
    ctx.config.global.projects = {};
    const result = await sendMessage.handle({ content: "Oops" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("auto-wraps in embed by default", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Hello embed", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.template).toBe("simple");
    // Verify send was called with embeds, not content
    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([expect.objectContaining({ description: "Hello embed" })]),
      }),
    );
  });

  it("sends plain text when raw=true", async () => {
    const ctx = createCtx();
    const result = await sendMessage.handle(
      { content: "Plain text", raw: true, project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.template).toBeUndefined();
    expect(data.content).toBeDefined();
    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Plain text" }),
    );
  });
});

describe("get_messages", () => {
  it("fetches messages from a channel", async () => {
    const ctx = createCtx();
    const result = await getMessages.handle({ channel_id: "222222222222222222", limit: 10 }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe("222222222222222222");
    // embeds and attachments should be arrays, not counts
    const msg = data.messages[0];
    expect(Array.isArray(msg.embeds)).toBe(true);
    expect(Array.isArray(msg.attachments)).toBe(true);
  });

  it("returns full embed content instead of just a count", async () => {
    const mockEmbed = {
      title: "Bot Response",
      description: "Here is the embed body",
      url: "https://example.com",
      color: 0x5865f2,
      fields: [
        { name: "Field 1", value: "Value 1", inline: true },
        { name: "Field 2", value: "Value 2" },
      ],
      author: {
        name: "AuthorName",
        url: "https://author.example.com",
        iconURL: "https://author.example.com/icon.png",
      },
      footer: { text: "Footer text", iconURL: "https://footer.example.com/icon.png" },
      thumbnail: { url: "https://example.com/thumb.png" },
      image: { url: "https://example.com/image.png" },
      timestamp: "2026-01-01T00:00:00.000Z",
    };

    const attachment = {
      id: "900000000000000000",
      name: "file.txt",
      url: "https://cdn.discordapp.com/attachments/file.txt",
      size: 1024,
      contentType: "text/plain",
    };
    const attachmentsMap = new Map([["900000000000000000", attachment]]);

    const msgWithEmbed = createMockMessage({
      embeds: [mockEmbed],
      attachments: attachmentsMap,
    });

    const mockChannel = createMockChannel({
      messages: {
        fetch: vi.fn().mockResolvedValue(new Map([["111111111111111111", msgWithEmbed]])),
      },
    });

    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getMessages.handle({ channel_id: "222222222222222222", limit: 10 }, ctx);
    expect(result.isError).toBeUndefined();

    const data = JSON.parse(result.content[0]!.text);
    const msg = data.messages[0];

    // Verify embed fields are fully mapped
    expect(msg.embeds).toHaveLength(1);
    const embed = msg.embeds[0];
    expect(embed.title).toBe("Bot Response");
    expect(embed.description).toBe("Here is the embed body");
    expect(embed.url).toBe("https://example.com");
    expect(embed.color).toBe(0x5865f2);
    expect(embed.fields).toHaveLength(2);
    expect(embed.fields[0]).toEqual({ name: "Field 1", value: "Value 1", inline: true });
    expect(embed.fields[1]).toEqual({ name: "Field 2", value: "Value 2", inline: false });
    expect(embed.author).toEqual({
      name: "AuthorName",
      url: "https://author.example.com",
      icon_url: "https://author.example.com/icon.png",
    });
    expect(embed.footer).toEqual({
      text: "Footer text",
      icon_url: "https://footer.example.com/icon.png",
    });
    expect(embed.thumbnail).toEqual({ url: "https://example.com/thumb.png" });
    expect(embed.image).toEqual({ url: "https://example.com/image.png" });
    expect(embed.timestamp).toBe("2026-01-01T00:00:00.000Z");

    // Verify attachment fields are fully mapped
    expect(msg.attachments).toHaveLength(1);
    const att = msg.attachments[0];
    expect(att.id).toBe("900000000000000000");
    expect(att.filename).toBe("file.txt");
    expect(att.url).toBe("https://cdn.discordapp.com/attachments/file.txt");
    expect(att.size).toBe(1024);
    expect(att.content_type).toBe("text/plain");
  });

  it("handles embeds with missing optional fields gracefully", async () => {
    const minimalEmbed = {
      title: null,
      description: "Just a description",
      url: undefined,
      color: null,
      fields: undefined,
      author: null,
      footer: null,
      thumbnail: null,
      image: null,
      timestamp: null,
    };

    const msgWithMinimalEmbed = createMockMessage({
      embeds: [minimalEmbed],
    });

    const mockChannel = createMockChannel({
      messages: {
        fetch: vi.fn().mockResolvedValue(new Map([["111111111111111111", msgWithMinimalEmbed]])),
      },
    });

    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await getMessages.handle({ channel_id: "222222222222222222", limit: 10 }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    const embed = data.messages[0].embeds[0];

    expect(embed.title).toBeNull();
    expect(embed.description).toBe("Just a description");
    expect(embed.url).toBeNull();
    expect(embed.fields).toEqual([]);
    expect(embed.author).toBeNull();
    expect(embed.footer).toBeNull();
    expect(embed.thumbnail).toBeNull();
    expect(embed.image).toBeNull();
    expect(embed.timestamp).toBeNull();
  });
});

describe("edit_message", () => {
  it("edits a message", async () => {
    const ctx = createCtx();
    const result = await editMessage.handle(
      { message_id: "111111111111111111", content: "Updated", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
  });
});

describe("delete_message", () => {
  it("deletes a message", async () => {
    const ctx = createCtx();
    const result = await deleteMessage.handle(
      { message_id: "111111111111111111", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Deleted");
  });
});

describe("add_reaction", () => {
  it("adds a reaction", async () => {
    const ctx = createCtx();
    const result = await addReaction.handle(
      { message_id: "111111111111111111", emoji: "\u{1F44D}", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Added reaction");
  });
});

describe("search_messages", () => {
  it("finds matching messages on page 1", async () => {
    const ctx = createCtx();
    // max_pages and limit must be passed explicitly since handle() bypasses Zod defaults.
    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "Test", max_pages: 1, limit: 25 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.matches).toBe(1);
    expect(data.results[0].content).toContain("Test");
    expect(data.has_more).toBe(false);
  });

  it("returns nothing when query does not match", async () => {
    const ctx = createCtx();
    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "xyzzy-no-match", max_pages: 1, limit: 25 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.matches).toBe(0);
  });

  it("fetches page 2 when max_pages=2 and match is only in page 2", async () => {
    const ctx = createCtx();

    // Build 100 non-matching messages for page 1 using safe integer IDs
    // (base 500000000000 keeps us well within Number.MAX_SAFE_INTEGER).
    const page1Messages = new Map<string, ReturnType<typeof createMockMessage>>();
    for (let i = 0; i < 100; i++) {
      const id = String(500000000000 + i);
      page1Messages.set(id, createMockMessage({ id, content: "no match here" }));
    }
    // The last entry inserted is the oldest — its ID is the "before" cursor for page 2.
    const oldestPage1Id = String(500000000099);

    // Page-2 batch: a single matching message with an older (smaller) ID.
    const page2Match = createMockMessage({
      id: "400000000001",
      content: "found in page two",
    });
    const page2Messages = new Map([["400000000001", page2Match]]);

    const messagesFetch = vi
      .fn()
      .mockResolvedValueOnce(page1Messages)
      .mockResolvedValueOnce(page2Messages);

    const mockChannel = {
      id: "222222222222222222",
      isTextBased: () => true,
      messages: { fetch: messagesFetch },
    };
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await searchMessages.handle(
      { channel_id: "222222222222222222", query: "page two", max_pages: 2, limit: 25 },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.matches).toBe(1);
    expect(data.results[0].content).toBe("found in page two");
    // Page 2 returned fewer than 100 messages so no more history exists.
    expect(data.has_more).toBe(false);

    // Verify the second fetch used the correct "before" cursor.
    expect(messagesFetch).toHaveBeenCalledTimes(2);
    expect(messagesFetch).toHaveBeenNthCalledWith(2, { limit: 100, before: oldestPage1Id });
  });
});

describe("send_embed", () => {
  it("has correct metadata", () => {
    expect(sendEmbed.name).toBe("send_embed");
    expect(sendEmbed.category).toBe("messaging");
  });

  it("blocks private-range image_url (SSRF)", async () => {
    const ctx = createCtx();
    const result = await sendEmbed.handle(
      {
        url: "https://example.com",
        channel_id: "222222222222222222",
        image_url: "http://192.168.1.1/admin.png",
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("private or reserved address");
  });

  it("blocks loopback image_url (SSRF)", async () => {
    const ctx = createCtx();
    const result = await sendEmbed.handle(
      {
        url: "https://example.com",
        channel_id: "222222222222222222",
        image_url: "http://127.0.0.1/secret.png",
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("private or reserved address");
  });

  it("allows public image_url through", async () => {
    const ctx = createCtx();
    const result = await sendEmbed.handle(
      {
        url: "https://example.com",
        channel_id: "222222222222222222",
        image_url: "https://example.com/banner.png",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
  });

  it("sends embed without image_url when none provided", async () => {
    const ctx = createCtx();
    const result = await sendEmbed.handle(
      {
        url: "https://example.com",
        channel_id: "222222222222222222",
        title: "Test embed",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.url).toBe("https://example.com");
  });
});
