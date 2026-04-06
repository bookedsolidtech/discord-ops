import { z } from "zod";
import { defineTool, toolResultJson } from "./types.js";
import { snowflakeId } from "./schema.js";
import { getTokenForProject } from "../config/index.js";

const inputSchema = z.object({
  guild_id: snowflakeId.optional().describe("Guild ID to check permissions for"),
  project: z.string().optional().describe("Project name (resolves bot token for multi-bot setups)"),
});

export const healthCheck = defineTool({
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
      default_project: ctx.config.perProject?.project ?? ctx.config.global.default_project ?? null,
    };

    // Show which projects have custom token_env
    const multiBot: Record<string, string> = {};
    for (const [name, project] of Object.entries(ctx.config.global.projects)) {
      if (project.token_env) {
        multiBot[name] = project.token_env;
      }
    }
    if (Object.keys(multiBot).length > 0) {
      result.multi_bot = multiBot;
    }

    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;

    if (connected) {
      const client = await ctx.discord.getClient(token);
      result.bot_user = client.user?.tag;
      result.guild_count = client.guilds.cache.size;
      result.uptime_seconds = Math.floor((client.uptime ?? 0) / 1000);
    }

    if (input.guild_id) {
      try {
        const guild = await ctx.discord.getGuild(input.guild_id, token);
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
});
