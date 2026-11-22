import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Replace the registry with synthetic tools named like the real ones.
vi.mock("../src/tools/index.js", () => ({ allTools: [] }));

import { createServer } from "../src/server.js";
import { invalidDeniedTools } from "../src/config/deny-tools-gate.js";
import type { ToolDefinition, ToolContext } from "../src/tools/types.js";

const { allTools } = await import("../src/tools/index.js");

const STRAWN_GUILD = "444444444444444444";
const OTHER_GUILD = "555555555555555555";

function tool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    category: "moderation",
    inputSchema: z.object({
      project: z.string().optional(),
      channel: z.string().optional(),
      channel_id: z.string().optional(),
      to_channel_id: z.string().optional(),
      thread_id: z.string().optional(),
      webhook_id: z.string().optional(),
      guild_id: z.string().optional(),
    }),
    handle: vi.fn().mockResolvedValue({ content: [{ type: "text", text: `${name} ran` }] }),
  } as ToolDefinition;
}

// channels.fetch resolves an unconfigured channel id to its guild; "999…" is unknown.
function ctx(denyTools?: string[]): ToolContext {
  const fetch = vi.fn(async (id: string) => {
    if (id === "300000000000000001") return { guildId: STRAWN_GUILD };
    if (id === "300000000000000002") return { guildId: OTHER_GUILD };
    throw new Error("Unknown Channel");
  });
  return {
    discord: {
      getClient: vi.fn(async () => ({
        channels: { fetch },
        fetchWebhook: vi.fn(async (id: string) => {
          if (id === "600000000000000001") return { guildId: STRAWN_GUILD };
          if (id === "600000000000000002") return { guildId: OTHER_GUILD };
          throw new Error("Unknown Webhook");
        }),
      })),
    } as any,
    config: {
      defaultToken: "x".repeat(60),
      global: {
        default_project: "other",
        projects: {
          "strawn-games": {
            guild_id: STRAWN_GUILD,
            channels: { general: "200000000000000001" },
            ...(denyTools ? { deny_tools: denyTools } : {}),
          },
          other: { guild_id: OTHER_GUILD, channels: { lobby: "200000000000000002" } },
        },
      },
    } as any,
  };
}

function handler(server: ReturnType<typeof createServer>["server"], name: string) {
  return (server as any)._registeredTools[name].handler as (
    p: Record<string, unknown>,
  ) => Promise<any>;
}

const DENIED = ["ban_member", "kick_member", "delete_channel", "delete_role", "purge_messages"];

describe("server deny_tools gate", () => {
  beforeEach(() => {
    allTools.length = 0;
  });

  it.each([
    ["project + alias", { project: "strawn-games", channel: "general" }],
    ["guild_id only", { guild_id: STRAWN_GUILD }],
    ["guild_id under another project", { project: "other", guild_id: STRAWN_GUILD }],
    ["configured channel_id, no project", { channel_id: "200000000000000001" }],
    ["unconfigured channel_id in the guild", { channel_id: "300000000000000001" }],
    ["channel_id that cannot be placed (fails closed)", { channel_id: "999999999999999999" }],
    ["thread_id in the guild", { thread_id: "300000000000000001" }],
    [
      "webhook_id in the guild with another guild_id",
      { webhook_id: "600000000000000001", guild_id: OTHER_GUILD },
    ],
    ["webhook_id that cannot be fetched (fails closed)", { webhook_id: "699999999999999999" }],
    [
      "to_channel_id in the guild",
      { channel_id: "300000000000000002", to_channel_id: "300000000000000001" },
    ],
  ])("refuses a denied tool routed by %s", async (_label, params) => {
    const ban = tool("ban_member");
    allTools.push(ban);
    const { server } = createServer(ctx(DENIED), { profile: "full" });
    const result = await handler(server, "ban_member")(params);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/ban_member/);
    expect(ban.handle).not.toHaveBeenCalled();
  });

  it.each([
    ["another project's guild", { guild_id: OTHER_GUILD }],
    ["another guild's channel", { channel_id: "300000000000000002" }],
  ])("runs a denied tool in %s", async (_label, params) => {
    const kick = tool("kick_member");
    allTools.push(kick);
    const { server } = createServer(ctx(DENIED));
    const result = await handler(server, "kick_member")(params);
    expect(result.isError).toBeFalsy();
    expect(kick.handle).toHaveBeenCalled();
  });

  it("leaves tools outside deny_tools alone in the same guild", async () => {
    const timeout = tool("timeout_member");
    const del = tool("delete_message");
    allTools.push(timeout, del);
    const { server } = createServer(ctx(DENIED));
    for (const name of ["timeout_member", "delete_message"]) {
      const result = await handler(server, name)({ guild_id: STRAWN_GUILD });
      expect(result.isError).toBeFalsy();
    }
  });

  it("runs everything when no project sets deny_tools", async () => {
    const ban = tool("ban_member");
    allTools.push(ban);
    const { server } = createServer(ctx());
    const result = await handler(server, "ban_member")({ guild_id: STRAWN_GUILD });
    expect(result.isError).toBeFalsy();
  });

  it("reports deny_tools names that are typos or unsupported", () => {
    expect(
      invalidDeniedTools({
        "strawn-games": { deny_tools: ["ban_member", "ban_members", "forward_message"] },
        other: {},
      }),
    ).toEqual(["strawn-games: ban_members", "strawn-games: forward_message"]);
  });

  it("refuses to start with an unsupported deny_tools entry", () => {
    allTools.push(tool("get_notes"));
    expect(() => createServer(ctx(["get_notes"]))).toThrow(/deny_tools names unsupported tools/);
  });

  it("refuses a denied tool when no guild can be resolved", async () => {
    const del = tool("delete_message");
    allTools.push(del);
    const c = ctx(["delete_message"]);
    delete (c.config.global as any).default_project;
    const { server } = createServer(c);
    const result = await handler(server, "delete_message")({});
    expect(result.isError).toBe(true);
    expect(del.handle).not.toHaveBeenCalled();
  });
});
