import { describe, it, expect, vi } from "vitest";
import { createPersona } from "../../src/tools/personas/create-persona.js";
import { sendAs } from "../../src/tools/personas/send-as.js";
import { listPersonas } from "../../src/tools/personas/list-personas.js";
import { PERSONA_WEBHOOK_NAME } from "../../src/tools/personas/persona-webhook.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockChannel,
  createMockGuild,
  createMockWebhook,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

/** Bot user id from createMockDiscordClient().getClient() */
const BOT_ID = "100000000000000000";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

function botOwnedWebhook(overrides: Record<string, unknown> = {}) {
  return createMockWebhook({ owner: { id: BOT_ID, tag: "TestBot#0001" }, ...overrides });
}

function channelWithWebhooks(webhooks: Array<{ id: string }>) {
  return createMockChannel({
    fetchWebhooks: vi.fn().mockResolvedValue(new Map(webhooks.map((wh) => [wh.id, wh]))),
  });
}

// --- create_persona ---

describe("create_persona", () => {
  it("has correct metadata", () => {
    expect(createPersona.name).toBe("create_persona");
    expect(createPersona.category).toBe("personas");
    expect(createPersona.permissions).toContain("ManageWebhooks");
  });

  it("creates a persona webhook when the channel has none", async () => {
    const mockChannel = createMockChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await createPersona.handle(
      { name: "Scout", channel_id: "222222222222222222" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(mockChannel.createWebhook).toHaveBeenCalledWith({
      name: PERSONA_WEBHOOK_NAME,
      reason: "discord-ops agent persona webhook",
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.persona).toEqual({ name: "Scout", avatar_url: null });
    expect(data.webhook_id).toBe("888888888888888888");
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.reused_existing_webhook).toBe(false);
  });

  it("passes reason through to webhook creation", async () => {
    const mockChannel = createMockChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    await createPersona.handle(
      { name: "Scout", channel_id: "222222222222222222", reason: "Agent team setup" },
      ctx,
    );

    expect(mockChannel.createWebhook).toHaveBeenCalledWith({
      name: PERSONA_WEBHOOK_NAME,
      reason: "Agent team setup",
    });
  });

  it("reuses an existing bot-owned webhook", async () => {
    const existing = botOwnedWebhook();
    const mockChannel = channelWithWebhooks([existing]);
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await createPersona.handle(
      { name: "Scout", channel_id: "222222222222222222" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(mockChannel.createWebhook).not.toHaveBeenCalled();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.webhook_id).toBe("888888888888888888");
    expect(data.reused_existing_webhook).toBe(true);
  });

  it("does not reuse a webhook owned by another application", async () => {
    // default createMockWebhook owner is 333333333333333333, not the bot
    const foreign = createMockWebhook({ id: "777777777777777777" });
    const mockChannel = channelWithWebhooks([foreign]);
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await createPersona.handle(
      { name: "Scout", channel_id: "222222222222222222" },
      ctx,
    );

    expect(mockChannel.createWebhook).toHaveBeenCalled();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.reused_existing_webhook).toBe(false);
  });

  it("skips token-less webhooks (channel followers cannot post)", async () => {
    const follower = botOwnedWebhook({ id: "666666666666666666", token: null, type: 2 });
    const mockChannel = channelWithWebhooks([follower]);
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await createPersona.handle(
      { name: "Scout", channel_id: "222222222222222222" },
      ctx,
    );

    expect(mockChannel.createWebhook).toHaveBeenCalled();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.reused_existing_webhook).toBe(false);
  });

  it("prefers the persona-named webhook when several qualify", async () => {
    const other = botOwnedWebhook({ id: "777777777777777777", name: "Other Hook" });
    const persona = botOwnedWebhook({ id: "888888888888888888", name: PERSONA_WEBHOOK_NAME });
    const mockChannel = channelWithWebhooks([other, persona]);
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await createPersona.handle(
      { name: "Scout", channel_id: "222222222222222222" },
      ctx,
    );

    const data = JSON.parse(result.content[0]!.text);
    expect(data.webhook_id).toBe("888888888888888888");
    expect(data.webhook_name).toBe(PERSONA_WEBHOOK_NAME);
  });

  it("never leaks the webhook token or url", async () => {
    const existing = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([existing]));

    const result = await createPersona.handle(
      { name: "Scout", channel_id: "222222222222222222" },
      ctx,
    );

    expect(result.content[0]!.text).not.toContain("webhook-token");
    expect(result.content[0]!.text).not.toContain("discord.com/api/webhooks");
  });

  it("routes via project + channel alias", async () => {
    const ctx = createCtx();
    const result = await createPersona.handle(
      { name: "Scout", project: "test-project", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything());
    const data = JSON.parse(result.content[0]!.text);
    expect(data.project).toBe("test-project");
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createCtx();
    (ctx.config.global as any).default_project = undefined;
    (ctx.config.global as any).projects = {};
    const result = await createPersona.handle({ name: "Scout" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("blocks private-range avatar_url (SSRF)", async () => {
    const ctx = createCtx();
    const result = await createPersona.handle(
      {
        name: "Scout",
        channel_id: "222222222222222222",
        avatar_url: "http://169.254.169.254/latest/meta-data/",
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("private or reserved address");
  });

  it("returns error for channels without webhook support (threads)", async () => {
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue({
      id: "555555555555555555",
      isTextBased: () => true,
    });
    const result = await createPersona.handle(
      { name: "Scout", channel_id: "555555555555555555" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("does not support webhooks");
  });

  it("rejects reserved and over-length persona names in schema", () => {
    const reserved = createPersona.inputSchema.safeParse({
      name: "Discord Announcer",
      channel_id: "222222222222222222",
    });
    expect(reserved.success).toBe(false);

    const clyde = createPersona.inputSchema.safeParse({
      name: "clyde-bot",
      channel_id: "222222222222222222",
    });
    expect(clyde.success).toBe(false);

    const tooLong = createPersona.inputSchema.safeParse({
      name: "x".repeat(81),
      channel_id: "222222222222222222",
    });
    expect(tooLong.success).toBe(false);
  });
});

// --- send_as ---

describe("send_as", () => {
  it("has correct metadata", () => {
    expect(sendAs.name).toBe("send_as");
    expect(sendAs.category).toBe("personas");
    expect(sendAs.destructive).toBe(true);
    expect(sendAs.permissions).toContain("ManageWebhooks");
  });

  it("posts as the persona via per-message username override", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    const result = await sendAs.handle(
      { persona_name: "Scout", content: "Recon complete", channel_id: "222222222222222222" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(webhook.send).toHaveBeenCalledWith({
      content: "Recon complete",
      username: "Scout",
      avatarURL: undefined,
      embeds: undefined,
    });
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("111111111111111111");
    expect(data.message_id).toBe("111111111111111111");
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.persona).toBe("Scout");
    expect(data.webhook_id).toBe("888888888888888888");
    expect(data.thread_id).toBeNull();
  });

  it("reuses the channel's existing persona webhook", async () => {
    const webhook = botOwnedWebhook();
    const mockChannel = channelWithWebhooks([webhook]);
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    await sendAs.handle(
      { persona_name: "Scout", content: "Hello", channel_id: "222222222222222222" },
      ctx,
    );

    expect(mockChannel.createWebhook).not.toHaveBeenCalled();
  });

  it("auto-provisions the persona webhook when the channel has none", async () => {
    const created = botOwnedWebhook();
    const mockChannel = createMockChannel({
      createWebhook: vi.fn().mockResolvedValue(created),
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await sendAs.handle(
      { persona_name: "Scout", content: "First post", channel_id: "222222222222222222" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(mockChannel.createWebhook).toHaveBeenCalledWith(
      expect.objectContaining({ name: PERSONA_WEBHOOK_NAME }),
    );
    expect(created.send).toHaveBeenCalled();
  });

  it("passes per-message avatar override", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    await sendAs.handle(
      {
        persona_name: "Scout",
        content: "Hi",
        avatar_url: "https://example.com/scout.png",
        channel_id: "222222222222222222",
      },
      ctx,
    );

    expect(webhook.send).toHaveBeenCalledWith(
      expect.objectContaining({ avatarURL: "https://example.com/scout.png" }),
    );
  });

  it("targets a thread via thread_id", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    const result = await sendAs.handle(
      {
        persona_name: "Scout",
        content: "In thread",
        channel_id: "222222222222222222",
        thread_id: "555555555555555555",
      },
      ctx,
    );

    expect(webhook.send).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "555555555555555555" }),
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.thread_id).toBe("555555555555555555");
  });

  it("omits threadId from the webhook call when thread_id is not provided", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    await sendAs.handle(
      { persona_name: "Scout", content: "No thread", channel_id: "222222222222222222" },
      ctx,
    );

    const callArg = (webhook.send as any).mock.calls[0]![0];
    expect("threadId" in callArg).toBe(false);
  });

  it("passes embeds through", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    const embeds = [
      {
        title: "Status Report",
        description: "All clear",
        color: 0x00ff00,
        fields: [{ name: "Sector", value: "7G", inline: true }],
      },
    ];

    const result = await sendAs.handle(
      { persona_name: "Scout", embeds, channel_id: "222222222222222222" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(webhook.send).toHaveBeenCalledWith(expect.objectContaining({ embeds }));
  });

  it("requires content or embeds", async () => {
    const ctx = createCtx();
    const result = await sendAs.handle(
      { persona_name: "Scout", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("content or embeds");
  });

  it("blocks private-range embed image url (SSRF)", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    const result = await sendAs.handle(
      {
        persona_name: "Scout",
        embeds: [{ title: "Test", image: { url: "http://10.0.0.1/secret.png" } }],
        channel_id: "222222222222222222",
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("private or reserved address");
    expect(webhook.send).not.toHaveBeenCalled();
  });

  it("blocks private-range avatar_url (SSRF)", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    const result = await sendAs.handle(
      {
        persona_name: "Scout",
        content: "Test",
        avatar_url: "http://192.168.1.1/avatar.png",
        channel_id: "222222222222222222",
      },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(webhook.send).not.toHaveBeenCalled();
  });

  it("never leaks the webhook token or url", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    const result = await sendAs.handle(
      { persona_name: "Scout", content: "Hello", channel_id: "222222222222222222" },
      ctx,
    );

    expect(result.content[0]!.text).not.toContain("webhook-token");
    expect(result.content[0]!.text).not.toContain("discord.com/api/webhooks");
  });

  it("routes via project + channel alias and reports the project", async () => {
    const webhook = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([webhook]));

    const result = await sendAs.handle(
      { persona_name: "Scout", content: "Routed", project: "test-project", channel: "dev" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything());
    const data = JSON.parse(result.content[0]!.text);
    expect(data.project).toBe("test-project");
  });

  it("returns error for unresolvable routing", async () => {
    const ctx = createCtx();
    (ctx.config.global as any).default_project = undefined;
    (ctx.config.global as any).projects = {};
    const result = await sendAs.handle({ persona_name: "Scout", content: "Oops" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("has no reply_to input — webhook executions cannot use message references", () => {
    const shape = (sendAs.inputSchema as any).shape;
    expect(shape.reply_to).toBeUndefined();
    expect(shape.thread_id).toBeDefined();
  });

  it("rejects reserved persona names in schema", () => {
    const reserved = sendAs.inputSchema.safeParse({
      persona_name: "Discord Mod",
      content: "Hi",
      channel_id: "222222222222222222",
    });
    expect(reserved.success).toBe(false);
  });
});

// --- list_personas ---

describe("list_personas", () => {
  it("has correct metadata", () => {
    expect(listPersonas.name).toBe("list_personas");
    expect(listPersonas.category).toBe("personas");
    expect(listPersonas.permissions).toContain("ManageWebhooks");
  });

  it("lists channel-scoped persona webhooks, filtering foreign and token-less ones", async () => {
    const usable = botOwnedWebhook({ id: "888888888888888888", name: PERSONA_WEBHOOK_NAME });
    const foreign = createMockWebhook({ id: "777777777777777777" });
    const tokenless = botOwnedWebhook({ id: "666666666666666666", token: null });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(
      channelWithWebhooks([usable, foreign, tokenless]),
    );

    const result = await listPersonas.handle({ channel_id: "222222222222222222" }, ctx);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.scope).toBe("channel");
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.count).toBe(1);
    expect(data.persona_webhooks).toEqual([
      {
        webhook_id: "888888888888888888",
        name: PERSONA_WEBHOOK_NAME,
        channel_id: "222222222222222222",
        created_at: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(data.note).toContain("per-message");
  });

  it("never leaks webhook tokens or urls", async () => {
    const usable = botOwnedWebhook();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channelWithWebhooks([usable]));

    const result = await listPersonas.handle({ channel_id: "222222222222222222" }, ctx);

    expect(result.content[0]!.text).not.toContain("webhook-token");
    expect(result.content[0]!.text).not.toContain("discord.com/api/webhooks");
  });

  it("lists guild-wide via guild_id", async () => {
    const usable = botOwnedWebhook();
    const guild = createMockGuild({
      fetchWebhooks: vi.fn().mockResolvedValue(new Map([[usable.id, usable]])),
    });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await listPersonas.handle({ guild_id: "444444444444444444" }, ctx);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.scope).toBe("guild");
    expect(data.guild_id).toBe("444444444444444444");
    expect(data.count).toBe(1);
    expect(data.persona_webhooks[0].webhook_id).toBe("888888888888888888");
  });

  it("resolves the guild from a project name", async () => {
    const ctx = createCtx();
    const result = await listPersonas.handle({ project: "test-project" }, ctx);

    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getGuild).toHaveBeenCalledWith("444444444444444444", expect.anything());
    const data = JSON.parse(result.content[0]!.text);
    expect(data.scope).toBe("guild");
    expect(data.project).toBe("test-project");
    expect(data.count).toBe(0);
  });

  it("falls back to the default project when no routing is given", async () => {
    const ctx = createCtx();
    const result = await listPersonas.handle({}, ctx);

    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getGuild).toHaveBeenCalledWith("444444444444444444", expect.anything());
    const data = JSON.parse(result.content[0]!.text);
    expect(data.project).toBe("test-project");
  });

  it("returns error for unknown project", async () => {
    const ctx = createCtx();
    const result = await listPersonas.handle({ project: "nope" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('"nope" not found');
  });

  it("returns error when nothing is resolvable", async () => {
    const ctx = createCtx();
    (ctx.config.global as any).default_project = undefined;
    (ctx.config.global as any).projects = {};
    const result = await listPersonas.handle({}, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Provide guild_id");
  });

  it("returns error for channels without webhook support", async () => {
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue({
      id: "555555555555555555",
      isTextBased: () => true,
    });
    const result = await listPersonas.handle({ channel_id: "555555555555555555" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("does not support webhooks");
  });
});
