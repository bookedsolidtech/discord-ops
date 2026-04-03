import { describe, it, expect, vi } from "vitest";
import { queryAuditLog } from "../../src/tools/audit/query-audit-log.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockGuild,
  createMockAuditLogEntry,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

describe("query_audit_log", () => {
  it("has correct metadata", () => {
    expect(queryAuditLog.name).toBe("query_audit_log");
    expect(queryAuditLog.category).toBe("audit");
    expect(queryAuditLog.permissions).toContain("ViewAuditLog");
    expect(queryAuditLog.requiresGuild).toBe(true);
  });

  it("fetches audit log entries", async () => {
    const entry = createMockAuditLogEntry();
    const guild = createMockGuild();
    (guild.fetchAuditLogs as any).mockResolvedValue({
      entries: {
        map: vi.fn().mockImplementation((fn: any) => [fn(entry)]),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await queryAuditLog.handle({ guild_id: "444444444444444444" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.guild_id).toBe("444444444444444444");
    expect(data.entries).toBeTruthy();
  });

  it("filters by user_id", async () => {
    const guild = createMockGuild();
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await queryAuditLog.handle(
      { guild_id: "444444444444444444", user_id: "333333333333333333" },
      ctx,
    );

    expect(guild.fetchAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ user: "333333333333333333" }),
    );
  });

  it("filters by action_type", async () => {
    const guild = createMockGuild();
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await queryAuditLog.handle({ guild_id: "444444444444444444", action_type: "MemberKick" }, ctx);

    expect(guild.fetchAuditLogs).toHaveBeenCalledWith(
      expect.objectContaining({ type: expect.any(Number) }),
    );
  });

  it("respects limit parameter", async () => {
    const guild = createMockGuild();
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    await queryAuditLog.handle({ guild_id: "444444444444444444", limit: 10 }, ctx);

    expect(guild.fetchAuditLogs).toHaveBeenCalledWith(expect.objectContaining({ limit: 10 }));
  });

  it("validates limit range via schema", () => {
    const tooHigh = queryAuditLog.inputSchema.safeParse({
      guild_id: "444444444444444444",
      limit: 101,
    });
    expect(tooHigh.success).toBe(false);

    const tooLow = queryAuditLog.inputSchema.safeParse({
      guild_id: "444444444444444444",
      limit: 0,
    });
    expect(tooLow.success).toBe(false);
  });

  it("defaults limit to 25", () => {
    const parsed = queryAuditLog.inputSchema.parse({
      guild_id: "444444444444444444",
    });
    expect(parsed.limit).toBe(25);
  });

  it("returns error for unknown action_type", async () => {
    const guild = createMockGuild();
    const ctx = createCtx();
    (ctx.discord.getGuild as any).mockResolvedValue(guild);

    const result = await queryAuditLog.handle(
      { guild_id: "444444444444444444", action_type: "NonExistentAction" },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("NonExistentAction");
    expect(guild.fetchAuditLogs).not.toHaveBeenCalled();
  });
});
