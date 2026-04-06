import { describe, it, expect, vi } from "vitest";
import { createWebhook } from "../../src/tools/webhooks/create-webhook.js";
import { getWebhook } from "../../src/tools/webhooks/get-webhook.js";
import { listWebhooks } from "../../src/tools/webhooks/list-webhooks.js";
import { editWebhook } from "../../src/tools/webhooks/edit-webhook.js";
import { deleteWebhook } from "../../src/tools/webhooks/delete-webhook.js";
import { executeWebhook } from "../../src/tools/webhooks/execute-webhook.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockChannel,
  createMockGuild,
  createMockWebhook,
  createMockMessage,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

// --- create_webhook ---

describe("create_webhook", () => {
  it("has correct metadata", () => {
    expect(createWebhook.name).toBe("create_webhook");
    expect(createWebhook.category).toBe("webhooks");
    expect(createWebhook.permissions).toContain("ManageWebhooks");
  });

  it("creates a webhook successfully", async () => {
    const ctx = createCtx();
    const result = await createWebhook.handle(
      { channel_id: "222222222222222222", name: "CI Bot" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("888888888888888888");
    expect(data.name).toBe("Test Webhook");
    expect(data.channel_id).toBe("222222222222222222");
  });

  it("redacts webhook token and url in response", async () => {
    const ctx = createCtx();
    const result = await createWebhook.handle(
      { channel_id: "222222222222222222", name: "CI Bot" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.token).toBe("[PRESENT]");
    expect(data.url).toBe("[PRESENT]");
  });

  it("passes reason to createWebhook call", async () => {
    const mockChannel = createMockChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    await createWebhook.handle(
      { channel_id: "222222222222222222", name: "Deploy Bot", reason: "CI/CD integration" },
      ctx,
    );

    expect(mockChannel.createWebhook).toHaveBeenCalledWith({
      name: "Deploy Bot",
      reason: "CI/CD integration",
    });
  });

  it("returns error for unsupported channel", async () => {
    const channel = { id: "222222222222222222", isTextBased: () => true };
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await createWebhook.handle(
      { channel_id: "222222222222222222", name: "Test" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("does not support webhooks");
  });

  it("validates name length", () => {
    const tooLong = createWebhook.inputSchema.safeParse({
      channel_id: "222222222222222222",
      name: "x".repeat(81),
    });
    expect(tooLong.success).toBe(false);
  });
});

// --- get_webhook ---

describe("get_webhook", () => {
  it("gets webhook details", async () => {
    const ctx = createCtx();
    const result = await getWebhook.handle(
      { webhook_id: "888888888888888888", guild_id: "444444444444444444" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("888888888888888888");
    expect(data.name).toBe("Test Webhook");
    expect(data.channel_id).toBe("222222222222222222");
  });

  it("includes owner info", async () => {
    const ctx = createCtx();
    const result = await getWebhook.handle(
      { webhook_id: "888888888888888888", guild_id: "444444444444444444" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.owner).toBeTruthy();
    expect(data.owner.id).toBe("333333333333333333");
  });
});

// --- list_webhooks ---

describe("list_webhooks", () => {
  it("has correct metadata", () => {
    expect(listWebhooks.name).toBe("list_webhooks");
    expect(listWebhooks.permissions).toContain("ManageWebhooks");
    expect(listWebhooks.requiresGuild).toBe(true);
  });

  it("lists guild webhooks", async () => {
    const ctx = createCtx();
    const result = await listWebhooks.handle({ guild_id: "444444444444444444" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.guild_id).toBe("444444444444444444");
    expect(data.count).toBe(0);
    expect(data.webhooks).toEqual([]);
  });

  it("lists channel-scoped webhooks", async () => {
    const webhook = createMockWebhook();
    const mockChannel = createMockChannel({
      fetchWebhooks: vi.fn().mockResolvedValue(new Map([["888888888888888888", webhook]])),
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await listWebhooks.handle(
      { guild_id: "444444444444444444", channel_id: "222222222222222222" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(1);
    expect(data.channel_id).toBe("222222222222222222");
  });

  it("returns error for unsupported channel", async () => {
    const channel = { id: "222222222222222222", isTextBased: () => true };
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await listWebhooks.handle(
      { guild_id: "444444444444444444", channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});

// --- edit_webhook ---

describe("edit_webhook", () => {
  it("has correct metadata", () => {
    expect(editWebhook.name).toBe("edit_webhook");
    expect(editWebhook.permissions).toContain("ManageWebhooks");
  });

  it("edits webhook name", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = {
      user: { tag: "TestBot#0001" },
      guilds: { cache: new Map(), size: 0 },
      uptime: 60000,
      isReady: () => true,
      fetchWebhook: vi.fn().mockResolvedValue(mockWebhook),
    };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await editWebhook.handle(
      { webhook_id: "888888888888888888", guild_id: "444444444444444444", name: "Renamed Hook" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(mockWebhook.edit).toHaveBeenCalledWith({
      name: "Renamed Hook",
      channel: undefined,
      reason: undefined,
    });
  });

  it("moves webhook to different channel", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = {
      fetchWebhook: vi.fn().mockResolvedValue(mockWebhook),
    };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    await editWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        channel_id: "666666666666666666",
        reason: "Reorganizing",
      },
      ctx,
    );
    expect(mockWebhook.edit).toHaveBeenCalledWith({
      name: undefined,
      channel: "666666666666666666",
      reason: "Reorganizing",
    });
  });
});

// --- delete_webhook ---

describe("delete_webhook", () => {
  it("has correct metadata", () => {
    expect(deleteWebhook.name).toBe("delete_webhook");
    expect(deleteWebhook.destructive).toBe(true);
    expect(deleteWebhook.permissions).toContain("ManageWebhooks");
  });

  it("deletes a webhook", async () => {
    const mockWebhook = createMockWebhook({ name: "Doomed Hook" });
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await deleteWebhook.handle(
      { webhook_id: "888888888888888888", guild_id: "444444444444444444" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Doomed Hook");
    expect(mockWebhook.delete).toHaveBeenCalled();
  });

  it("passes reason to delete", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    await deleteWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        reason: "No longer needed",
      },
      ctx,
    );
    expect(mockWebhook.delete).toHaveBeenCalledWith("No longer needed");
  });
});

// --- execute_webhook ---

describe("execute_webhook", () => {
  it("has correct metadata", () => {
    expect(executeWebhook.name).toBe("execute_webhook");
    expect(executeWebhook.category).toBe("webhooks");
  });

  it("sends a message through a webhook", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        content: "Build passed!",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(mockWebhook.send).toHaveBeenCalledWith({
      content: "Build passed!",
      username: undefined,
      avatarURL: undefined,
      embeds: undefined,
    });
  });

  it("sends with username and avatar override", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    await executeWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        content: "Deploy complete",
        username: "Deploy Bot",
        avatar_url: "https://example.com/bot.png",
      },
      ctx,
    );
    expect(mockWebhook.send).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "Deploy Bot",
        avatarURL: "https://example.com/bot.png",
      }),
    );
  });

  it("sends embeds", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const embeds = [
      {
        title: "Build Report",
        description: "All tests passed",
        color: 0x00ff00,
        fields: [{ name: "Tests", value: "41/41", inline: true }],
      },
    ];

    await executeWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        embeds,
      },
      ctx,
    );
    expect(mockWebhook.send).toHaveBeenCalledWith(expect.objectContaining({ embeds }));
  });

  it("returns error for webhook without token", async () => {
    const mockWebhook = createMockWebhook({ token: null });
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      { webhook_id: "888888888888888888", guild_id: "444444444444444444", content: "Test" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no token");
  });

  it("works without guild_id", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      { webhook_id: "888888888888888888", content: "No guild needed" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.webhook_id).toBe("888888888888888888");
  });

  it("guild_id is optional in schema", () => {
    const result = executeWebhook.inputSchema.safeParse({
      webhook_id: "888888888888888888",
      content: "Hello",
    });
    expect(result.success).toBe(true);
  });

  it("returns message details on success", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      { webhook_id: "888888888888888888", guild_id: "444444444444444444", content: "Hello" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBeTruthy();
    expect(data.webhook_id).toBe("888888888888888888");
  });

  it("blocks private-range embed.url (SSRF)", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        embeds: [{ title: "Test", url: "http://192.168.1.1/admin" }],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("private or reserved address");
    expect(mockWebhook.send).not.toHaveBeenCalled();
  });

  it("blocks private-range embed image.url (SSRF)", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        embeds: [{ title: "Test", image: { url: "http://10.0.0.1/secret.png" } }],
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("private or reserved address");
    expect(mockWebhook.send).not.toHaveBeenCalled();
  });

  it("allows public embed URLs through", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        embeds: [
          {
            title: "Deploy",
            url: "https://example.com/deploy",
            image: { url: "https://example.com/banner.png" },
          },
        ],
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(mockWebhook.send).toHaveBeenCalled();
  });

  it("blocks private-range avatar_url (SSRF)", async () => {
    const mockWebhook = createMockWebhook();
    const mockClient = { fetchWebhook: vi.fn().mockResolvedValue(mockWebhook) };
    const ctx = createCtx();
    (ctx.discord.getClient as any).mockResolvedValue(mockClient);

    const result = await executeWebhook.handle(
      {
        webhook_id: "888888888888888888",
        guild_id: "444444444444444444",
        content: "Test",
        avatar_url: "http://169.254.169.254/latest/meta-data/",
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("private or reserved address");
    expect(mockWebhook.send).not.toHaveBeenCalled();
  });
});
