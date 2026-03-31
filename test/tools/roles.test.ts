import { describe, it, expect, vi } from "vitest";
import { listRoles } from "../../src/tools/roles/list-roles.js";
import { createRole } from "../../src/tools/roles/create-role.js";
import { editRole } from "../../src/tools/roles/edit-role.js";
import { deleteRole } from "../../src/tools/roles/delete-role.js";
import { assignRole } from "../../src/tools/roles/assign-role.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockGuild,
  createMockRole,
  createMockMember,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

// --- list_roles (existing) ---

describe("list_roles", () => {
  it("lists roles in a guild", async () => {
    const ctx = createCtx();
    const result = await listRoles.handle({ guild_id: "444444444444444444" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.guild_id).toBe("444444444444444444");
  });
});

// --- create_role ---

describe("create_role", () => {
  it("has correct metadata", () => {
    expect(createRole.name).toBe("create_role");
    expect(createRole.category).toBe("roles");
    expect(createRole.permissions).toContain("ManageRoles");
    expect(createRole.requiresGuild).toBe(true);
  });

  it("creates a role with just a name", async () => {
    const ctx = createCtx();
    const result = await createRole.handle(
      { guild_id: "444444444444444444", name: "Moderator" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.name).toBeTruthy();
    expect(data.id).toBeTruthy();
    expect(data.guild_id).toBe("444444444444444444");
  });

  it("creates a role with all options", async () => {
    const guild = createMockGuild();
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await createRole.handle(
      {
        guild_id: "444444444444444444",
        name: "VIP",
        color: "#ff0000",
        mentionable: true,
        hoist: true,
        reason: "New VIP role",
      },
      ctx,
    );

    expect(guild.roles.create).toHaveBeenCalledWith({
      name: "VIP",
      color: "#ff0000",
      mentionable: true,
      hoist: true,
      reason: "New VIP role",
    });
  });

  it("passes project token for multi-bot routing", async () => {
    const ctx = createCtx();
    await createRole.handle(
      { guild_id: "444444444444444444", name: "Test", project: "test-project" },
      ctx,
    );
    expect(ctx.discord.getGuild).toHaveBeenCalled();
  });

  it("validates name length via schema", () => {
    const tooLong = createRole.inputSchema.safeParse({
      guild_id: "444444444444444444",
      name: "x".repeat(101),
    });
    expect(tooLong.success).toBe(false);

    const empty = createRole.inputSchema.safeParse({
      guild_id: "444444444444444444",
      name: "",
    });
    expect(empty.success).toBe(false);
  });
});

// --- edit_role ---

describe("edit_role", () => {
  it("has correct metadata", () => {
    expect(editRole.name).toBe("edit_role");
    expect(editRole.category).toBe("roles");
    expect(editRole.permissions).toContain("ManageRoles");
  });

  it("edits a role successfully", async () => {
    const mockRole = createMockRole({ id: "999999999999999999" });
    const guild = createMockGuild();
    const rolesMap = new Map([["999999999999999999", mockRole]]);
    (guild.roles.fetch as any).mockResolvedValue(rolesMap);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await editRole.handle(
      {
        guild_id: "444444444444444444",
        role_id: "999999999999999999",
        name: "Super Mod",
        color: "#00ff00",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(mockRole.edit).toHaveBeenCalledWith({
      name: "Super Mod",
      color: "#00ff00",
      mentionable: undefined,
      hoist: undefined,
      reason: undefined,
    });
  });

  it("returns error for non-existent role", async () => {
    const guild = createMockGuild();
    const emptyMap = new Map();
    emptyMap.get = vi.fn().mockReturnValue(undefined);
    (guild.roles.fetch as any).mockResolvedValue(emptyMap);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await editRole.handle(
      { guild_id: "444444444444444444", role_id: "000000000000000000" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });

  it("edits with reason for audit log", async () => {
    const mockRole = createMockRole();
    const guild = createMockGuild();
    const rolesMap = new Map([["999999999999999999", mockRole]]);
    (guild.roles.fetch as any).mockResolvedValue(rolesMap);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await editRole.handle(
      {
        guild_id: "444444444444444444",
        role_id: "999999999999999999",
        name: "Renamed",
        reason: "Restructuring",
      },
      ctx,
    );

    expect(mockRole.edit).toHaveBeenCalledWith(
      expect.objectContaining({ reason: "Restructuring" }),
    );
  });
});

// --- delete_role ---

describe("delete_role", () => {
  it("has correct metadata", () => {
    expect(deleteRole.name).toBe("delete_role");
    expect(deleteRole.destructive).toBe(true);
    expect(deleteRole.permissions).toContain("ManageRoles");
  });

  it("deletes a role successfully", async () => {
    const mockRole = createMockRole({ id: "999999999999999999", name: "Doomed Role" });
    const guild = createMockGuild();
    const rolesMap = new Map([["999999999999999999", mockRole]]);
    (guild.roles.fetch as any).mockResolvedValue(rolesMap);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await deleteRole.handle(
      { guild_id: "444444444444444444", role_id: "999999999999999999" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("Doomed Role");
    expect(mockRole.delete).toHaveBeenCalled();
  });

  it("passes reason to delete call", async () => {
    const mockRole = createMockRole({ id: "999999999999999999" });
    const guild = createMockGuild();
    const rolesMap = new Map([["999999999999999999", mockRole]]);
    (guild.roles.fetch as any).mockResolvedValue(rolesMap);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await deleteRole.handle(
      { guild_id: "444444444444444444", role_id: "999999999999999999", reason: "Cleanup" },
      ctx,
    );
    expect(mockRole.delete).toHaveBeenCalledWith("Cleanup");
  });

  it("returns error for non-existent role", async () => {
    const guild = createMockGuild();
    const emptyMap = new Map();
    emptyMap.get = vi.fn().mockReturnValue(undefined);
    (guild.roles.fetch as any).mockResolvedValue(emptyMap);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await deleteRole.handle(
      { guild_id: "444444444444444444", role_id: "000000000000000000" },
      ctx,
    );
    expect(result.isError).toBe(true);
  });
});

// --- assign_role ---

describe("assign_role", () => {
  it("has correct metadata", () => {
    expect(assignRole.name).toBe("assign_role");
    expect(assignRole.category).toBe("roles");
    expect(assignRole.permissions).toContain("ManageRoles");
  });

  it("adds a role to a member", async () => {
    const mockMember = createMockMember();
    const guild = createMockGuild();
    (guild.members.fetch as any).mockResolvedValue(mockMember);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await assignRole.handle(
      {
        guild_id: "444444444444444444",
        user_id: "333333333333333333",
        role_id: "999999999999999999",
        action: "add",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe("role_added");
    expect(mockMember.roles.add).toHaveBeenCalledWith("999999999999999999", undefined);
  });

  it("removes a role from a member", async () => {
    const mockMember = createMockMember();
    const guild = createMockGuild();
    (guild.members.fetch as any).mockResolvedValue(mockMember);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await assignRole.handle(
      {
        guild_id: "444444444444444444",
        user_id: "333333333333333333",
        role_id: "999999999999999999",
        action: "remove",
      },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe("role_removed");
    expect(mockMember.roles.remove).toHaveBeenCalledWith("999999999999999999", undefined);
  });

  it("defaults action to add", () => {
    const parsed = assignRole.inputSchema.parse({
      guild_id: "444444444444444444",
      user_id: "333333333333333333",
      role_id: "999999999999999999",
    });
    expect(parsed.action).toBe("add");
  });

  it("passes reason to role operation", async () => {
    const mockMember = createMockMember();
    const guild = createMockGuild();
    (guild.members.fetch as any).mockResolvedValue(mockMember);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await assignRole.handle(
      {
        guild_id: "444444444444444444",
        user_id: "333333333333333333",
        role_id: "999999999999999999",
        action: "add",
        reason: "Promoted",
      },
      ctx,
    );
    expect(mockMember.roles.add).toHaveBeenCalledWith("999999999999999999", "Promoted");
  });

  it("rejects invalid action via schema", () => {
    const parsed = assignRole.inputSchema.safeParse({
      guild_id: "444444444444444444",
      user_id: "333333333333333333",
      role_id: "999999999999999999",
      action: "toggle",
    });
    expect(parsed.success).toBe(false);
  });

  it("includes user_tag in response", async () => {
    const ctx = createCtx();
    const result = await assignRole.handle(
      {
        guild_id: "444444444444444444",
        user_id: "333333333333333333",
        role_id: "999999999999999999",
      },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.user_tag).toBe("TestUser#0001");
  });
});
