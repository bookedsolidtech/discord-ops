import { describe, it, expect, vi } from "vitest";
import { setPermissions } from "../../src/tools/channels/permissions.js";
import {
  createMockDiscordClient,
  createMockChannel,
  createMockConfig,
} from "../mocks/discord-client.js";

function createCtx() {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig() as any,
  };
}

describe("set_permissions", () => {
  it("has correct metadata", () => {
    expect(setPermissions.name).toBe("set_permissions");
    expect(setPermissions.category).toBe("channels");
    expect(setPermissions.destructive).toBe(true);
    expect(setPermissions.permissions).toContain("ManageRoles");
    expect(setPermissions.requiresGuild).toBe(true);
  });

  it("sets allow permissions", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await setPermissions.handle(
      {
        channel_id: "222222222222222222",
        target_id: "999999999999999999",
        target_type: "role",
        allow: ["ViewChannel", "SendMessages"],
      },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Updated permissions");
    expect(result.content[0].text).toContain("ViewChannel, SendMessages");
    expect(mockCh.permissionOverwrites.edit).toHaveBeenCalledWith("999999999999999999", {
      ViewChannel: true,
      SendMessages: true,
    });
  });

  it("sets deny permissions", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await setPermissions.handle(
      {
        channel_id: "222222222222222222",
        target_id: "333333333333333333",
        target_type: "member",
        deny: ["SendMessages"],
      },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("member");
    expect(mockCh.permissionOverwrites.edit).toHaveBeenCalledWith("333333333333333333", {
      SendMessages: false,
    });
  });

  it("sets both allow and deny", async () => {
    const ctx = createCtx();
    const mockCh = createMockChannel();
    (ctx.discord.getChannel as any).mockResolvedValue(mockCh);

    const result = await setPermissions.handle(
      {
        channel_id: "222222222222222222",
        target_id: "999999999999999999",
        target_type: "role",
        allow: ["ViewChannel"],
        deny: ["SendMessages"],
      },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(mockCh.permissionOverwrites.edit).toHaveBeenCalledWith("999999999999999999", {
      ViewChannel: true,
      SendMessages: false,
    });
  });

  it("schema rejects invalid permission flag in allow list", () => {
    const result = setPermissions.inputSchema.safeParse({
      channel_id: "222222222222222222",
      target_id: "999999999999999999",
      target_type: "role",
      allow: ["NotARealPermission"],
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects invalid permission flag in deny list", () => {
    const result = setPermissions.inputSchema.safeParse({
      channel_id: "222222222222222222",
      target_id: "999999999999999999",
      target_type: "role",
      deny: ["HackTheGuild"],
    });
    expect(result.success).toBe(false);
  });

  it("schema accepts valid discord.js permission flags", () => {
    const result = setPermissions.inputSchema.safeParse({
      channel_id: "222222222222222222",
      target_id: "999999999999999999",
      target_type: "role",
      allow: ["ViewChannel", "SendMessages", "ReadMessageHistory"],
      deny: ["Administrator"],
    });
    expect(result.success).toBe(true);
  });
});
