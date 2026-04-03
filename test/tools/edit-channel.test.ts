import { describe, it, expect } from "vitest";
import { editChannel } from "../../src/tools/channels/edit-channel.js";
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

describe("edit_channel", () => {
  it("has correct metadata", () => {
    expect(editChannel.name).toBe("edit_channel");
    expect(editChannel.category).toBe("channels");
    expect(editChannel.permissions).toContain("ManageChannels");
    expect(editChannel.requiresGuild).toBe(true);
  });

  it("edits a channel name", async () => {
    const ctx = createCtx();
    const result = await editChannel.handle(
      { channel_id: "222222222222222222", name: "renamed-channel" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("222222222222222222");
    expect(data.name).toBe("renamed-channel");
  });

  it("edits a channel topic", async () => {
    const ctx = createCtx();
    const result = await editChannel.handle(
      { channel_id: "222222222222222222", topic: "New topic" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.topic).toBe("New topic");
  });

  it("edits a channel parent", async () => {
    const ctx = createCtx();
    const result = await editChannel.handle(
      { channel_id: "222222222222222222", parent_id: "555555555555555555" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
  });

  it("validates channel name length via schema", () => {
    const tooLong = editChannel.inputSchema.safeParse({
      channel_id: "222222222222222222",
      name: "a".repeat(101),
    });
    expect(tooLong.success).toBe(false);
  });

  it("validates topic length via schema", () => {
    const tooLong = editChannel.inputSchema.safeParse({
      channel_id: "222222222222222222",
      topic: "a".repeat(1025),
    });
    expect(tooLong.success).toBe(false);
  });

  it("edits a channel position", async () => {
    const ctx = createCtx();
    const result = await editChannel.handle({ channel_id: "222222222222222222", position: 3 }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("222222222222222222");
  });

  it("validates position is non-negative integer via schema", () => {
    const negative = editChannel.inputSchema.safeParse({
      channel_id: "222222222222222222",
      position: -1,
    });
    expect(negative.success).toBe(false);
  });
});
