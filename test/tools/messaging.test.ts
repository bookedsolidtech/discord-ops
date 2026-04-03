import { describe, it, expect, vi, afterEach } from "vitest";
import { sendMessage } from "../../src/tools/messaging/send-message.js";
import { sendEmbed } from "../../src/tools/messaging/send-embed.js";
import { getMessages } from "../../src/tools/messaging/get-messages.js";
import { editMessage } from "../../src/tools/messaging/edit-message.js";
import { deleteMessage } from "../../src/tools/messaging/delete-message.js";
import { addReaction } from "../../src/tools/messaging/add-reaction.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMessage,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

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
      { message_id: "111111111111111111", emoji: "👍", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Added reaction");
  });
});

function mockOgResponse(og: { title?: string; description?: string; image?: string }) {
  const metas = [
    og.title ? `<meta property="og:title" content="${og.title}" />` : "",
    og.description ? `<meta property="og:description" content="${og.description}" />` : "",
    og.image ? `<meta property="og:image" content="${og.image}" />` : "",
  ].join("\n");
  return new Response(`<html><head>${metas}</head></html>`, {
    headers: { "content-type": "text/html" },
  });
}

describe("send_embed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends embed with OG metadata", async () => {
    const ctx = createCtx();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        mockOgResponse({
          title: "OG Title",
          description: "OG Description",
          image: "https://example.com/image.png",
        }),
      ),
    );

    const result = await sendEmbed.handle(
      { url: "https://example.com", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.og_fetched).toBe(true);

    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            title: "OG Title",
            description: "OG Description",
            image: { url: "https://example.com/image.png" },
            url: "https://example.com",
          }),
        ]),
      }),
    );
  });

  it("overrides take precedence over OG", async () => {
    const ctx = createCtx();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(mockOgResponse({ title: "OG Title", description: "OG Desc" })),
    );

    await sendEmbed.handle(
      {
        url: "https://example.com",
        project: "test-project",
        channel: "dev",
        title: "Override Title",
        description: "Override Desc",
      },
      ctx,
    );

    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({ title: "Override Title", description: "Override Desc" }),
        ]),
      }),
    );
  });

  it("graceful degradation on fetch failure", async () => {
    const ctx = createCtx();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const result = await sendEmbed.handle(
      { url: "https://example.com", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();

    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([expect.objectContaining({ url: "https://example.com" })]),
      }),
    );
  });

  it("graceful degradation on no OG tags", async () => {
    const ctx = createCtx();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html><head><title>No OG</title></head></html>", {
          headers: { "content-type": "text/html" },
        }),
      ),
    );

    const result = await sendEmbed.handle(
      { url: "https://example.com", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.og_fetched).toBe(false);

    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([expect.objectContaining({ url: "https://example.com" })]),
      }),
    );
  });

  it("routes via project/channel", async () => {
    const ctx = createCtx();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockOgResponse({})));

    await sendEmbed.handle(
      { url: "https://example.com", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything());
  });

  it("routes via direct channel_id", async () => {
    const ctx = createCtx();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockOgResponse({})));

    await sendEmbed.handle({ url: "https://example.com", channel_id: "999999999999999999" }, ctx);
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("999999999999999999", undefined);
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createCtx();
    ctx.config.global.default_project = undefined;
    ctx.config.global.projects = {};
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockOgResponse({})));

    const result = await sendEmbed.handle({ url: "https://example.com" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("color and footer passed to Discord", async () => {
    const ctx = createCtx();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(mockOgResponse({})));

    await sendEmbed.handle(
      {
        url: "https://example.com",
        project: "test-project",
        channel: "dev",
        color: 7424138,
        footer: "Clarity House Press",
      },
      ctx,
    );

    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        embeds: expect.arrayContaining([
          expect.objectContaining({
            color: 7424138,
            footer: { text: "Clarity House Press" },
          }),
        ]),
      }),
    );
  });
});
