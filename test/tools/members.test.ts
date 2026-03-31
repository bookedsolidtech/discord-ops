import { describe, it, expect, vi } from "vitest";
import { listMembers } from "../../src/tools/members/list-members.js";
import { getMember } from "../../src/tools/members/get-member.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockGuild,
  createMockMember,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

// --- list_members ---

describe("list_members", () => {
  it("has correct metadata", () => {
    expect(listMembers.name).toBe("list_members");
    expect(listMembers.category).toBe("members");
    expect(listMembers.requiresGuild).toBe(true);
  });

  it("lists members in a guild", async () => {
    const mockMember = createMockMember();
    const membersMap = new Map([["333333333333333333", mockMember]]) as any;
    membersMap.map = vi.fn().mockImplementation((fn: any) => [...membersMap.values()].map(fn));

    const guild = createMockGuild();
    (guild.members.fetch as any).mockResolvedValue(membersMap);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await listMembers.handle({ guild_id: "444444444444444444" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.guild_id).toBe("444444444444444444");
    expect(data.count).toBe(1);
    expect(data.members[0].id).toBe("333333333333333333");
    expect(data.members[0].username).toBe("testuser");
    expect(data.members[0].bot).toBe(false);
  });

  it("respects limit parameter", () => {
    const parsed = listMembers.inputSchema.safeParse({
      guild_id: "444444444444444444",
      limit: 50,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.limit).toBe(50);
  });

  it("validates max limit via schema", () => {
    const parsed = listMembers.inputSchema.safeParse({
      guild_id: "444444444444444444",
      limit: 1001,
    });
    expect(parsed.success).toBe(false);
  });

  it("defaults limit to 100", () => {
    const parsed = listMembers.inputSchema.safeParse({
      guild_id: "444444444444444444",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.limit).toBe(100);
  });
});

// --- get_member ---

describe("get_member", () => {
  it("has correct metadata", () => {
    expect(getMember.name).toBe("get_member");
    expect(getMember.category).toBe("members");
    expect(getMember.requiresGuild).toBe(true);
  });

  it("gets detailed member info", async () => {
    const mockMember = createMockMember();
    const guild = createMockGuild();
    (guild.members.fetch as any).mockResolvedValue(mockMember);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await getMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("333333333333333333");
    expect(data.username).toBe("testuser");
    expect(data.discriminator).toBe("0001");
    expect(data.bot).toBe(false);
    expect(data.avatar).toBeTruthy();
    expect(data.joined_at).toBeTruthy();
    expect(data.permissions).toContain("SendMessages");
  });

  it("includes roles with colors", async () => {
    const mockMember = createMockMember();
    const guild = createMockGuild();
    (guild.members.fetch as any).mockResolvedValue(mockMember);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await getMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.roles).toBeInstanceOf(Array);
    expect(data.roles.length).toBeGreaterThan(0);
    expect(data.roles[0]).toHaveProperty("id");
    expect(data.roles[0]).toHaveProperty("name");
    expect(data.roles[0]).toHaveProperty("color");
  });

  it("handles unknown member error", async () => {
    const guild = createMockGuild({
      members: {
        fetch: vi.fn().mockRejectedValue(new Error("Unknown Member")),
        fetchMe: vi.fn(),
        ban: vi.fn(),
        unban: vi.fn(),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await expect(
      getMember.handle({ guild_id: "444444444444444444", user_id: "555555555555555555" }, ctx),
    ).rejects.toThrow("Unknown Member");
  });
});
