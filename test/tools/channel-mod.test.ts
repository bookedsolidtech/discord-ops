import { describe, it, expect, vi } from "vitest";
import { purgeMessages } from "../../src/tools/channels/purge-messages.js";
import { setSlowmode } from "../../src/tools/channels/set-slowmode.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockChannel,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

// --- purge_messages ---

describe("purge_messages", () => {
  it("has correct metadata", () => {
    expect(purgeMessages.name).toBe("purge_messages");
    expect(purgeMessages.category).toBe("channels");
    expect(purgeMessages.destructive).toBe(true);
    expect(purgeMessages.permissions).toContain("ManageMessages");
    expect(purgeMessages.requiresGuild).toBe(true);
  });

  it("purges messages from a channel", async () => {
    const ctx = createCtx();
    const result = await purgeMessages.handle({ channel_id: "222222222222222222", count: 10 }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe("222222222222222222");
    expect(data.requested).toBe(10);
    expect(data.deleted).toBe(10);
  });

  it("reports actual vs requested deletion count", async () => {
    const mockChannel = createMockChannel({
      bulkDelete: vi.fn().mockResolvedValue(
        new Map([
          ["1", {}],
          ["2", {}],
          ["3", {}],
        ]),
      ),
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await purgeMessages.handle({ channel_id: "222222222222222222", count: 50 }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.requested).toBe(50);
    expect(data.deleted).toBe(3);
  });

  it("includes reason in response", async () => {
    const ctx = createCtx();
    const result = await purgeMessages.handle(
      { channel_id: "222222222222222222", count: 5, reason: "Spam cleanup" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.reason).toBe("Spam cleanup");
  });

  it("returns error for unsupported channel", async () => {
    const channel = { id: "222222222222222222", isTextBased: () => true };
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await purgeMessages.handle({ channel_id: "222222222222222222", count: 10 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("does not support bulk delete");
  });

  it("validates count range via schema", () => {
    const tooHigh = purgeMessages.inputSchema.safeParse({
      channel_id: "222222222222222222",
      count: 101,
    });
    expect(tooHigh.success).toBe(false);

    const tooLow = purgeMessages.inputSchema.safeParse({
      channel_id: "222222222222222222",
      count: 0,
    });
    expect(tooLow.success).toBe(false);
  });

  it("calls bulkDelete with filterOld=true", async () => {
    const mockChannel = createMockChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    await purgeMessages.handle({ channel_id: "222222222222222222", count: 25 }, ctx);
    expect(mockChannel.bulkDelete).toHaveBeenCalledWith(25, true);
  });
});

// --- set_slowmode ---

describe("set_slowmode", () => {
  it("has correct metadata", () => {
    expect(setSlowmode.name).toBe("set_slowmode");
    expect(setSlowmode.category).toBe("channels");
    expect(setSlowmode.permissions).toContain("ManageChannels");
    expect(setSlowmode.requiresGuild).toBe(true);
  });

  it("sets slowmode on a channel", async () => {
    const ctx = createCtx();
    const result = await setSlowmode.handle({ channel_id: "222222222222222222", seconds: 30 }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.slowmode_seconds).toBe(30);
    expect(data.action).toBe("slowmode_set");
  });

  it("disables slowmode when seconds is 0", async () => {
    const ctx = createCtx();
    const result = await setSlowmode.handle({ channel_id: "222222222222222222", seconds: 0 }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.slowmode_seconds).toBe(0);
    expect(data.action).toBe("slowmode_disabled");
  });

  it("passes rateLimitPerUser to channel.edit", async () => {
    const mockChannel = createMockChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    await setSlowmode.handle(
      { channel_id: "222222222222222222", seconds: 60, reason: "Cooling off" },
      ctx,
    );

    expect(mockChannel.edit).toHaveBeenCalledWith({
      rateLimitPerUser: 60,
      reason: "Cooling off",
    });
  });

  it("validates max seconds via schema", () => {
    const tooHigh = setSlowmode.inputSchema.safeParse({
      channel_id: "222222222222222222",
      seconds: 21601,
    });
    expect(tooHigh.success).toBe(false);
  });

  it("validates negative seconds via schema", () => {
    const negative = setSlowmode.inputSchema.safeParse({
      channel_id: "222222222222222222",
      seconds: -1,
    });
    expect(negative.success).toBe(false);
  });

  it("returns channel name in response", async () => {
    const mockChannel = createMockChannel({ name: "general" });
    (mockChannel.edit as any).mockResolvedValue({ id: "222222222222222222", name: "general" });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(mockChannel);

    const result = await setSlowmode.handle({ channel_id: "222222222222222222", seconds: 10 }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.name).toBe("general");
  });
});
