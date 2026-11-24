import { describe, it, expect, vi } from "vitest";
import { createServer } from "../src/server.js";
import { deleteChannel } from "../src/tools/channels/delete-channel.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockChannel,
  createMockWebhook,
} from "./mocks/discord-client.js";

const GUILD = "444444444444444444";
const CHANNEL = "222222222222222222";
const HOOK = "888888888888888888";

type Inventory = Record<string, string[]>;

function setup(inventory?: Inventory, channelOverrides: Record<string, unknown> = {}) {
  const webhook = createMockWebhook({ id: HOOK, name: "Uploads", guildId: GUILD });
  const fetchWebhooks = vi.fn().mockResolvedValue(new Map([[HOOK, webhook]]));
  const channel = createMockChannel({
    delete: vi.fn().mockResolvedValue(undefined),
    fetchWebhooks,
    ...channelOverrides,
  }) as any;
  const client = { fetchWebhook: vi.fn().mockResolvedValue(webhook) };
  const ctx = {
    discord: createMockDiscordClient({
      getAnyChannel: vi.fn().mockResolvedValue(channel),
      getClient: vi.fn().mockResolvedValue(client),
    }) as any,
    config: createMockConfig() as any,
  };
  if (inventory) ctx.config.global.projects["test-project"].webhook_senders = inventory;
  return { ctx, channel, client, webhook, fetchWebhooks };
}

describe("delete_channel webhook_senders inventory", () => {
  it("refuses a channel holding a webhook with listed senders", async () => {
    const { ctx, channel } = setup({ [HOOK]: ["pulse (UPLOADS_HOOK)"] });
    const result = await deleteChannel.handle({ channel_id: CHANNEL }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("pulse (UPLOADS_HOOK)");
    expect(channel.delete).not.toHaveBeenCalled();
  });

  it("refuses a channel holding a webhook missing from the inventory", async () => {
    const { ctx, channel } = setup({});
    const result = await deleteChannel.handle({ channel_id: CHANNEL }, ctx);
    expect(result.isError).toBe(true);
    expect(channel.delete).not.toHaveBeenCalled();
  });

  it("refuses when the channel's webhooks cannot be listed", async () => {
    const { ctx, channel } = setup(
      { [HOOK]: [] },
      { fetchWebhooks: vi.fn().mockRejectedValue(new Error("Missing Permissions")) },
    );
    const result = await deleteChannel.handle({ channel_id: CHANNEL }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Missing Permissions");
    expect(channel.delete).not.toHaveBeenCalled();
  });

  it.each([
    ["every webhook is listed with no senders", { [HOOK]: [] }, {}, {}],
    ["senders_retired is true", { [HOOK]: ["pulse"] }, {}, { senders_retired: true }],
    ["the channel type has no webhooks", { [HOOK]: ["pulse"] }, { fetchWebhooks: undefined }, {}],
    ["the inventory is another guild's", {}, { guildId: "555555555555555555" }, {}],
  ])("deletes when %s", async (_label, inventory, overrides, input) => {
    const { ctx, channel } = setup(inventory as Inventory, overrides);
    if ("fetchWebhooks" in overrides) delete channel.fetchWebhooks;
    const result = await deleteChannel.handle({ channel_id: CHANNEL, ...input }, ctx);
    expect(result.isError).toBeUndefined();
    expect(channel.delete).toHaveBeenCalled();
  });

  it("does not list webhooks when no project keeps an inventory", async () => {
    const { ctx, channel, fetchWebhooks } = setup();
    await deleteChannel.handle({ channel_id: CHANNEL }, ctx);
    expect(fetchWebhooks).not.toHaveBeenCalled();
    expect(channel.delete).toHaveBeenCalled();
  });
});

describe("dry-run webhook_senders preflight", () => {
  const CALLS = [
    ["delete_webhook", { webhook_id: HOOK, guild_id: GUILD }],
    ["delete_channel", { channel_id: CHANNEL }],
  ] as const;

  function dryRun(ctx: any, name: string, params: Record<string, unknown>) {
    const { server } = createServer(ctx, { dryRun: true, profile: "full" });
    return (server as any)._registeredTools[name].handler(params);
  }

  it.each(CALLS)("%s reports the refusal the real call would give", async (name, params) => {
    const { ctx, channel, webhook } = setup({ [HOOK]: ["pulse"] });
    const result = await dryRun(ctx, name, params);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("pulse");
    expect(channel.delete).not.toHaveBeenCalled();
    expect(webhook.delete).not.toHaveBeenCalled();
  });

  it.each(CALLS)("%s still simulates when nothing sends to it", async (name, params) => {
    const { ctx, channel, webhook } = setup({ [HOOK]: [] });
    const result = await dryRun(ctx, name, params);
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("DRY RUN");
    expect(channel.delete).not.toHaveBeenCalled();
    expect(webhook.delete).not.toHaveBeenCalled();
  });

  it.each(CALLS)("%s makes no webhook reads without an inventory", async (name, params) => {
    const { ctx, client, fetchWebhooks } = setup();
    const result = await dryRun(ctx, name, params);
    expect(result.content[0].text).toContain("DRY RUN");
    expect(client.fetchWebhook).not.toHaveBeenCalled();
    expect(fetchWebhooks).not.toHaveBeenCalled();
  });
});
