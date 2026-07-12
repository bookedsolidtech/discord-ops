import { describe, it, expect, vi } from "vitest";
import { forwardMessage } from "../../src/tools/messaging/forward-message.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMessage,
  createMockChannel,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

const SOURCE_CHANNEL = "222222222222222222";
const DEST_CHANNEL = "666666666666666666";
const SOURCE_MESSAGE = "111111111111111111";
const FORWARDED_MESSAGE = "121212121212121212";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

/**
 * Wires getChannel to return distinct source/destination channels, with the
 * source channel serving messages that expose a forward() mock.
 */
function createForwardCtx() {
  const ctx = createCtx();
  const forward = vi.fn().mockResolvedValue(createMockMessage({ id: FORWARDED_MESSAGE }));
  const destChannel = createMockChannel({ id: DEST_CHANNEL, name: "summary" });
  const sourceChannel = createMockChannel({
    id: SOURCE_CHANNEL,
    messages: {
      fetch: vi
        .fn()
        .mockImplementation(async (id: string) => createMockMessage({ id, forward })),
    },
  });
  (ctx.discord.getChannel as any).mockImplementation(async (id: string) =>
    id === DEST_CHANNEL ? destChannel : sourceChannel,
  );
  return { ctx, forward, sourceChannel, destChannel };
}

describe("forward_message", () => {
  it("has correct metadata", () => {
    expect(forwardMessage.name).toBe("forward_message");
    expect(forwardMessage.category).toBe("messaging");
    expect(forwardMessage.permissions).toEqual(["SendMessages"]);
  });

  it("forwards a message to a direct destination channel id", async () => {
    const { ctx, forward, destChannel } = createForwardCtx();
    const result = await forwardMessage.handle(
      {
        message_id: SOURCE_MESSAGE,
        channel_id: SOURCE_CHANNEL,
        to_channel_id: DEST_CHANNEL,
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(forward).toHaveBeenCalledWith(destChannel);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe(FORWARDED_MESSAGE);
    expect(data.message_id).toBe(FORWARDED_MESSAGE);
    expect(data.channel_id).toBe(DEST_CHANNEL);
    expect(data.forwarded_from).toEqual({
      channel_id: SOURCE_CHANNEL,
      message_id: SOURCE_MESSAGE,
    });
  });

  it("resolves the destination via project channel alias", async () => {
    const { ctx, forward } = createForwardCtx();
    // "builds" maps to 666666666666666666 in the mock config
    const result = await forwardMessage.handle(
      {
        message_id: SOURCE_MESSAGE,
        project: "test-project",
        channel: "dev",
        to_channel: "builds",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(forward).toHaveBeenCalledTimes(1);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe(DEST_CHANNEL);
    expect(data.forwarded_from.channel_id).toBe(SOURCE_CHANNEL);
  });

  it("errors when no destination is provided", async () => {
    const { ctx, forward } = createForwardCtx();
    const result = await forwardMessage.handle(
      { message_id: SOURCE_MESSAGE, channel_id: SOURCE_CHANNEL },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("to_channel");
    expect(forward).not.toHaveBeenCalled();
  });

  it("errors when the destination alias cannot be resolved", async () => {
    const { ctx, forward } = createForwardCtx();
    const result = await forwardMessage.handle(
      {
        message_id: SOURCE_MESSAGE,
        channel_id: SOURCE_CHANNEL,
        to_channel: "zzz-no-such-alias",
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Cannot resolve destination");
    expect(forward).not.toHaveBeenCalled();
  });

  it("errors when the source routing cannot be resolved", async () => {
    const { ctx } = createForwardCtx();
    ctx.config.global.default_project = undefined;
    ctx.config.global.projects = {};
    const result = await forwardMessage.handle(
      { message_id: SOURCE_MESSAGE, channel: "dev", to_channel_id: DEST_CHANNEL },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Cannot resolve source");
  });

  it("errors when source and destination are the same channel", async () => {
    const { ctx, forward } = createForwardCtx();
    const result = await forwardMessage.handle(
      {
        message_id: SOURCE_MESSAGE,
        channel_id: SOURCE_CHANNEL,
        to_channel_id: SOURCE_CHANNEL,
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("same as the source");
    expect(forward).not.toHaveBeenCalled();
  });

  it("distinguishes a deleted source message (10008) from other failures", async () => {
    const { ctx, sourceChannel } = createForwardCtx();
    (sourceChannel.messages.fetch as any).mockRejectedValue(
      Object.assign(new Error("Unknown Message"), { code: 10008 }),
    );
    const result = await forwardMessage.handle(
      {
        message_id: SOURCE_MESSAGE,
        channel_id: SOURCE_CHANNEL,
        to_channel_id: DEST_CHANNEL,
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toBe(
      `Message ${SOURCE_MESSAGE} not found in channel ${SOURCE_CHANNEL}`,
    );
  });

  it("surfaces non-10008 fetch failures without claiming deletion", async () => {
    const { ctx, sourceChannel } = createForwardCtx();
    (sourceChannel.messages.fetch as any).mockRejectedValue(
      Object.assign(new Error("Missing Access"), { code: 50001 }),
    );
    const result = await forwardMessage.handle(
      {
        message_id: SOURCE_MESSAGE,
        channel_id: SOURCE_CHANNEL,
        to_channel_id: DEST_CHANNEL,
      },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Failed to fetch message");
    expect(result.content[0]!.text).not.toContain("not found");
  });

  it("validates message_id and to_channel_id as snowflakes via schema", () => {
    expect(
      forwardMessage.inputSchema.safeParse({
        message_id: "not-a-snowflake",
        to_channel_id: DEST_CHANNEL,
      }).success,
    ).toBe(false);

    expect(
      forwardMessage.inputSchema.safeParse({
        message_id: SOURCE_MESSAGE,
        to_channel_id: "123",
      }).success,
    ).toBe(false);

    expect(
      forwardMessage.inputSchema.safeParse({
        message_id: SOURCE_MESSAGE,
        to_channel_id: DEST_CHANNEL,
      }).success,
    ).toBe(true);
  });
});
