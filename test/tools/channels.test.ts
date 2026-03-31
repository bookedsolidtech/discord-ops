import { describe, it, expect } from "vitest";
import { listChannels } from "../../src/tools/channels/list-channels.js";
import { getChannel } from "../../src/tools/channels/get-channel.js";
import { createChannel } from "../../src/tools/channels/create-channel.js";
import { deleteChannel } from "../../src/tools/channels/delete-channel.js";
import { createMockDiscordClient, createMockConfig, createMockChannel } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

describe("list_channels", () => {
  it("lists channels in a guild", async () => {
    const ctx = createCtx();
    const result = await listChannels.handle(
      { guild_id: "444444444444444444" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.guild_id).toBe("444444444444444444");
  });
});

describe("get_channel", () => {
  it("gets channel details", async () => {
    const ctx = createCtx();
    const result = await getChannel.handle(
      { channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("222222222222222222");
  });
});

describe("create_channel", () => {
  it("creates a channel", async () => {
    const ctx = createCtx();
    const result = await createChannel.handle(
      { guild_id: "444444444444444444", name: "new-channel", type: "text" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
  });
});

describe("delete_channel", () => {
  it("deletes a channel", async () => {
    const ctx = createCtx();
    const result = await deleteChannel.handle(
      { channel_id: "222222222222222222" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Deleted");
  });
});
