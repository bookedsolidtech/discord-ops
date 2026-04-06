import { describe, it, expect, vi } from "vitest";
import { pinMessage } from "../../src/tools/messaging/pin.js";
import { unpinMessage } from "../../src/tools/messaging/unpin.js";
import {
  createMockDiscordClient,
  createMockChannel,
  createMockMessage,
  createMockConfig,
} from "../mocks/discord-client.js";

function createCtx() {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig() as any,
  };
}

describe("pin_message", () => {
  it("has correct metadata", () => {
    expect(pinMessage.name).toBe("pin_message");
    expect(pinMessage.category).toBe("messaging");
    expect(pinMessage.permissions).toContain("ManageMessages");
  });

  it("pins a message", async () => {
    const ctx = createCtx();
    const mockMsg = createMockMessage();
    const mockCh = createMockChannel();
    mockCh.messages.fetch = vi.fn().mockResolvedValue(mockMsg);
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await pinMessage.handle(
      { channel_id: "222222222222222222", message_id: "111111111111111111" },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Pinned");
    expect(mockMsg.pin).toHaveBeenCalled();
  });
});

describe("unpin_message", () => {
  it("has correct metadata", () => {
    expect(unpinMessage.name).toBe("unpin_message");
    expect(unpinMessage.category).toBe("messaging");
  });

  it("unpins a message", async () => {
    const ctx = createCtx();
    const mockMsg = createMockMessage({ pinned: true });
    const mockCh = createMockChannel();
    mockCh.messages.fetch = vi.fn().mockResolvedValue(mockMsg);
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await unpinMessage.handle(
      { channel_id: "222222222222222222", message_id: "111111111111111111" },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Unpinned");
    expect(mockMsg.unpin).toHaveBeenCalled();
  });
});
