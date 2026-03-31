import { z } from "zod";
import type { ToolDefinition } from "./types.js";
import { toolResultJson } from "./types.js";

const inputSchema = z.object({
  guild_id: z.string().optional().describe("Guild ID to check permissions for"),
});

export const healthCheck: ToolDefinition = {
  name: "health_check",
  description:
    "Check bot connection status, permissions, and project routing config. Optionally checks permissions in a specific guild.",
  category: "system",
  inputSchema,
  handle: async (input, ctx) => {
    const connected = ctx.discord.isConnected;

    const result: Record<string, unknown> = {
      status: "ok",
      connected,
      projects: Object.keys(ctx.config.global.projects),
      default_project:
        ctx.config.perProject?.project ?? ctx.config.global.default_project ?? null,
    };

    if (connected) {
      const client = await ctx.discord.getClient();
      result.bot_user = client.user?.tag;
      result.guild_count = client.guilds.cache.size;
      result.uptime_seconds = Math.floor((client.uptime ?? 0) / 1000);
    }

    if (input.guild_id) {
      try {
        const guild = await ctx.discord.getGuild(input.guild_id);
        const me = await guild.members.fetchMe();
        result.guild = {
          id: guild.id,
          name: guild.name,
          permissions: me.permissions.toArray(),
        };
      } catch (err) {
        result.guild = {
          id: input.guild_id,
          error: err instanceof Error ? err.message : "Failed to fetch guild",
        };
      }
    }

    return toolResultJson(result);
  },
};
