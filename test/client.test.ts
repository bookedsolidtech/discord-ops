import { describe, it, expect, vi, beforeEach } from "vitest";
import { DiscordClient } from "../src/client.js";

const VALID_TOKEN = "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX0000";

function makeMockChannel(id: string) {
  return {
    id,
    isTextBased: () => true,
  };
}

function makeMockDiscordJsClient(channelFetch: ReturnType<typeof vi.fn>) {
  return {
    isReady: () => true,
    guilds: { cache: { size: 0 } },
    user: { tag: "TestBot#0001" },
    channels: { fetch: channelFetch },
  };
}

describe("DiscordClient channel cache", () => {
  let discord: DiscordClient;
  let channelFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    discord = new DiscordClient(VALID_TOKEN);
    channelFetch = vi.fn();

    // Override getClient directly on the instance so internal this.getClient()
    // calls also use the mock.
    (discord as any).getClient = vi.fn().mockResolvedValue(
      makeMockDiscordJsClient(channelFetch),
    );
  });

  it("returns cached channel on second call without calling channels.fetch again", async () => {
    const channelId = "222222222222222222";
    channelFetch.mockResolvedValue(makeMockChannel(channelId));

    const first = await discord.getChannel(channelId);
    const second = await discord.getChannel(channelId);

    expect(channelFetch).toHaveBeenCalledTimes(1);
    expect(first.id).toBe(channelId);
    expect(second.id).toBe(channelId);
  });

  it("re-throws Discord error code 10003 and does not cache the entry", async () => {
    const channelId = "333333333333333333";
    const unknownChannelError = Object.assign(new Error("Unknown Channel"), { code: 10003 });

    // First call: 10003 error — nothing cached, error is re-thrown.
    channelFetch.mockRejectedValueOnce(unknownChannelError);
    await expect(discord.getChannel(channelId)).rejects.toThrow("Unknown Channel");
    expect(channelFetch).toHaveBeenCalledTimes(1);

    // Second call: fresh fetch (no stale cache from the error).
    const mockChannel = makeMockChannel(channelId);
    channelFetch.mockResolvedValueOnce(mockChannel);
    const result = await discord.getChannel(channelId);
    expect(result.id).toBe(channelId);
    expect(channelFetch).toHaveBeenCalledTimes(2);

    // Third call: cache is now populated — fetch is NOT called again.
    const cachedResult = await discord.getChannel(channelId);
    expect(cachedResult.id).toBe(channelId);
    expect(channelFetch).toHaveBeenCalledTimes(2);
  });
});
