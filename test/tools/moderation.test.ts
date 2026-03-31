import { describe, it, expect, vi } from "vitest";
import { kickMember } from "../../src/tools/moderation/kick-member.js";
import { banMember } from "../../src/tools/moderation/ban-member.js";
import { unbanMember } from "../../src/tools/moderation/unban-member.js";
import { timeoutMember } from "../../src/tools/moderation/timeout-member.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMember,
  createMockGuild,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(overrides?: Record<string, unknown>): ToolContext {
  return {
    discord: createMockDiscordClient(overrides) as any,
    config: createMockConfig(),
  };
}

// --- kick_member ---

describe("kick_member", () => {
  it("has correct metadata", () => {
    expect(kickMember.name).toBe("kick_member");
    expect(kickMember.category).toBe("moderation");
    expect(kickMember.destructive).toBe(true);
    expect(kickMember.requiresGuild).toBe(true);
    expect(kickMember.permissions).toContain("KickMembers");
  });

  it("kicks a member successfully", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await kickMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe("kicked");
    expect(data.user_id).toBe("333333333333333333");
  });

  it("kicks with a reason", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await kickMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333", reason: "Spamming" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.reason).toBe("Spamming");
  });

  it("prevents kicking the bot itself", async () => {
    const ctx = createCtx();
    const result = await kickMember.handle(
      { guild_id: "444444444444444444", user_id: "100000000000000000" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("bot itself");
  });

  it("prevents kicking the guild owner", async () => {
    const ctx = createCtx();
    const result = await kickMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("guild owner");
  });

  it("rejects invalid snowflake IDs", () => {
    const parsed = kickMember.inputSchema.safeParse({
      guild_id: "not-a-snowflake",
      user_id: "333333333333333333",
    });
    expect(parsed.success).toBe(false);
  });

  it("handles missing member error", async () => {
    const guild = createMockGuild({
      ownerId: "999999999999999998",
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
      kickMember.handle({ guild_id: "444444444444444444", user_id: "555555555555555555" }, ctx),
    ).rejects.toThrow("Unknown Member");
  });
});

// --- ban_member ---

describe("ban_member", () => {
  it("has correct metadata", () => {
    expect(banMember.name).toBe("ban_member");
    expect(banMember.category).toBe("moderation");
    expect(banMember.destructive).toBe(true);
    expect(banMember.permissions).toContain("BanMembers");
  });

  it("bans a user successfully", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await banMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe("banned");
    expect(data.user_id).toBe("333333333333333333");
  });

  it("prevents banning the bot itself", async () => {
    const ctx = createCtx();
    const result = await banMember.handle(
      { guild_id: "444444444444444444", user_id: "100000000000000000" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("bot itself");
  });

  it("prevents banning the guild owner", async () => {
    const ctx = createCtx();
    const result = await banMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("guild owner");
  });

  it("bans with reason and message deletion", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await banMember.handle(
      {
        guild_id: "444444444444444444",
        user_id: "333333333333333333",
        reason: "Hate speech",
        delete_message_seconds: 86400,
      },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.reason).toBe("Hate speech");
    expect(data.delete_message_seconds).toBe(86400);
  });

  it("calls guild.members.ban with correct options", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await banMember.handle(
      {
        guild_id: "444444444444444444",
        user_id: "333333333333333333",
        reason: "Test",
        delete_message_seconds: 3600,
      },
      ctx,
    );

    expect(guild.members.ban).toHaveBeenCalledWith("333333333333333333", {
      reason: "Test",
      deleteMessageSeconds: 3600,
    });
  });

  it("defaults delete_message_seconds to 0 in response", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await banMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.delete_message_seconds).toBe(0);
  });

  it("validates delete_message_seconds range via schema", () => {
    const parsed = banMember.inputSchema.safeParse({
      guild_id: "444444444444444444",
      user_id: "333333333333333333",
      delete_message_seconds: 999999,
    });
    expect(parsed.success).toBe(false);
  });
});

// --- unban_member ---

describe("unban_member", () => {
  it("has correct metadata", () => {
    expect(unbanMember.name).toBe("unban_member");
    expect(unbanMember.category).toBe("moderation");
    expect(unbanMember.destructive).toBeUndefined();
    expect(unbanMember.permissions).toContain("BanMembers");
  });

  it("unbans a user successfully", async () => {
    const ctx = createCtx();
    const result = await unbanMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe("unbanned");
    expect(data.user_id).toBe("333333333333333333");
  });

  it("unbans with a reason", async () => {
    const ctx = createCtx();
    const result = await unbanMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333", reason: "Appeal accepted" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.reason).toBe("Appeal accepted");
  });

  it("calls guild.members.unban with correct args", async () => {
    const guild = createMockGuild();
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await unbanMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333", reason: "Forgiven" },
      ctx,
    );

    expect(guild.members.unban).toHaveBeenCalledWith("333333333333333333", "Forgiven");
  });
});

// --- timeout_member ---

describe("timeout_member", () => {
  it("has correct metadata", () => {
    expect(timeoutMember.name).toBe("timeout_member");
    expect(timeoutMember.category).toBe("moderation");
    expect(timeoutMember.permissions).toContain("ModerateMembers");
  });

  it("times out a member", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await timeoutMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333", duration_seconds: 3600 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe("timed_out");
    expect(data.duration_seconds).toBe(3600);
    expect(data.timeout_until).toBeTruthy();
  });

  it("removes timeout when duration is 0", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await timeoutMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333", duration_seconds: 0 },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.action).toBe("timeout_removed");
    expect(data.timeout_until).toBeNull();
  });

  it("passes reason to timeout call", async () => {
    const mockMember = createMockMember();
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    (guild.members.fetch as any).mockResolvedValue(mockMember);
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await timeoutMember.handle(
      {
        guild_id: "444444444444444444",
        user_id: "333333333333333333",
        duration_seconds: 600,
        reason: "Cooling off",
      },
      ctx,
    );

    expect(mockMember.timeout).toHaveBeenCalledWith(600000, "Cooling off");
  });

  it("validates max duration via schema", () => {
    const parsed = timeoutMember.inputSchema.safeParse({
      guild_id: "444444444444444444",
      user_id: "333333333333333333",
      duration_seconds: 9999999,
    });
    expect(parsed.success).toBe(false);
  });

  it("includes user_tag in response", async () => {
    const guild = createMockGuild({ ownerId: "999999999999999998" });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);
    const result = await timeoutMember.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333", duration_seconds: 60 },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.user_tag).toBe("TestUser#0001");
  });
});
