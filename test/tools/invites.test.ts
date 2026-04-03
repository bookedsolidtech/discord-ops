import { describe, it, expect, vi } from "vitest";
import { getInvites } from "../../src/tools/guilds/get-invites.js";
import { createInvite } from "../../src/tools/guilds/create-invite.js";
import {
  createMockDiscordClient,
  createMockGuild,
  createMockChannel,
  createMockConfig,
} from "../mocks/discord-client.js";

function createCtx() {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig() as any,
  };
}

describe("get_invites", () => {
  it("has correct metadata", () => {
    expect(getInvites.name).toBe("get_invites");
    expect(getInvites.category).toBe("guilds");
    expect(getInvites.permissions).toContain("ManageGuild");
    expect(getInvites.requiresGuild).toBe(true);
  });

  it("lists guild invites", async () => {
    const ctx = createCtx();
    const guild = createMockGuild();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await getInvites.handle({ guild_id: "444444444444444444" }, ctx);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.guild).toBe("Test Guild");
    expect(data.count).toBe(1);
    expect(data.invites).toHaveLength(1);
    expect(data.invites[0].code).toBe("abc123");
  });
});

describe("create_invite", () => {
  it("has correct metadata", () => {
    expect(createInvite.name).toBe("create_invite");
    expect(createInvite.category).toBe("guilds");
    expect(createInvite.permissions).toContain("CreateInstantInvite");
    expect(createInvite.requiresGuild).toBe(true);
  });

  it("creates an invite with defaults", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await createInvite.handle(
      {
        channel_id: "222222222222222222",
        max_age: 86400,
        max_uses: 0,
        temporary: false,
        unique: false,
      },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.code).toBe("abc123");
    expect(data.url).toBe("https://discord.gg/abc123");
    expect(mockCh.createInvite).toHaveBeenCalledWith({
      maxAge: 86400,
      maxUses: 0,
      temporary: false,
      unique: false,
    });
  });

  it("creates a temporary invite with custom settings", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await createInvite.handle(
      {
        channel_id: "222222222222222222",
        max_age: 3600,
        max_uses: 5,
        temporary: true,
        unique: true,
      },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockCh.createInvite).toHaveBeenCalledWith({
      maxAge: 3600,
      maxUses: 5,
      temporary: true,
      unique: true,
    });
  });
});
