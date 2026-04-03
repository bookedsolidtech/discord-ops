import { describe, it, expect, vi } from "vitest";
import { moveChannel } from "../../src/tools/channels/move-channel.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

const CHANNEL_ID = "222222222222222222";
const BEFORE_ID = "333333333333333333";
const AFTER_ID = "444444444444444444";

function makeChannel(id: string, position: number, parentId: string | null = null) {
  return { id, name: `channel-${position}`, position, parentId };
}

function createCtx(channelOverrides: Record<string, unknown> = {}): ToolContext {
  const channelA = makeChannel(CHANNEL_ID, 2);
  const channelBefore = makeChannel(BEFORE_ID, 1);
  const channelAfter = makeChannel(AFTER_ID, 3);

  const channelCache = new Map([
    [CHANNEL_ID, channelA],
    [BEFORE_ID, channelBefore],
    [AFTER_ID, channelAfter],
  ]);

  const guild = {
    channels: {
      cache: channelCache,
      fetch: vi.fn().mockImplementation(async (id: string) => {
        if (id === BEFORE_ID) return { ...channelBefore, position: 1 };
        if (id === AFTER_ID) return { ...channelAfter, position: 3 };
        if (id === CHANNEL_ID) return { ...channelA, position: 1, name: "channel-2" };
        return null;
      }),
      setPositions: vi.fn().mockResolvedValue(undefined),
    },
  };

  const mockChannel = {
    id: CHANNEL_ID,
    name: "channel-2",
    position: 2,
    parentId: null,
    guild,
    ...channelOverrides,
  };

  const discord = createMockDiscordClient();
  (discord.getAnyChannel as ReturnType<typeof vi.fn>).mockResolvedValue(mockChannel);

  return { discord: discord as any, config: createMockConfig() };
}

describe("move_channel", () => {
  it("has correct metadata", () => {
    expect(moveChannel.name).toBe("move_channel");
    expect(moveChannel.category).toBe("channels");
    expect(moveChannel.permissions).toContain("ManageChannels");
  });

  it("moves a channel before a reference channel", async () => {
    const ctx = createCtx();
    const result = await moveChannel.handle({ channel_id: CHANNEL_ID, before_id: BEFORE_ID }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe(CHANNEL_ID);
    expect(data.moved).toBe("before");
    expect(data.reference_id).toBe(BEFORE_ID);
  });

  it("moves a channel after a reference channel", async () => {
    const ctx = createCtx();
    const result = await moveChannel.handle({ channel_id: CHANNEL_ID, after_id: AFTER_ID }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.moved).toBe("after");
    expect(data.reference_id).toBe(AFTER_ID);
  });

  it("calls setPositions with before ref position", async () => {
    const ctx = createCtx();
    const mockChannel = await ctx.discord.getAnyChannel(CHANNEL_ID);
    await moveChannel.handle({ channel_id: CHANNEL_ID, before_id: BEFORE_ID }, ctx);
    expect(mockChannel.guild.channels.setPositions).toHaveBeenCalledWith([
      { channel: CHANNEL_ID, position: 1 }, // before_id has position 1
    ]);
  });

  it("calls setPositions with after ref position + 1", async () => {
    const ctx = createCtx();
    const mockChannel = await ctx.discord.getAnyChannel(CHANNEL_ID);
    await moveChannel.handle({ channel_id: CHANNEL_ID, after_id: AFTER_ID }, ctx);
    expect(mockChannel.guild.channels.setPositions).toHaveBeenCalledWith([
      { channel: CHANNEL_ID, position: 4 }, // after_id has position 3, so 3 + 1
    ]);
  });

  it("returns error when reference channel not found", async () => {
    const ctx = createCtx();
    const mockChannel = await ctx.discord.getAnyChannel(CHANNEL_ID);
    mockChannel.guild.channels.fetch.mockResolvedValue(null);
    const result = await moveChannel.handle({ channel_id: CHANNEL_ID, before_id: BEFORE_ID }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("returns error when reference channel is in a different category", async () => {
    const ctx = createCtx();
    // Make the channel in a different parent
    const mockChannel = await ctx.discord.getAnyChannel(CHANNEL_ID);
    mockChannel.parentId = "different-parent";
    const result = await moveChannel.handle({ channel_id: CHANNEL_ID, before_id: BEFORE_ID }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("same category");
  });

  it("schema rejects input with neither before_id nor after_id", () => {
    const result = moveChannel.inputSchema.safeParse({ channel_id: CHANNEL_ID });
    expect(result.success).toBe(false);
  });

  it("schema rejects input with both before_id and after_id", () => {
    const result = moveChannel.inputSchema.safeParse({
      channel_id: CHANNEL_ID,
      before_id: BEFORE_ID,
      after_id: AFTER_ID,
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects invalid snowflake IDs", () => {
    const result = moveChannel.inputSchema.safeParse({
      channel_id: "not-a-snowflake",
      before_id: BEFORE_ID,
    });
    expect(result.success).toBe(false);
  });
});
