import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";
import { getTokenForProject } from "../../config/index.js";

const inputSchema = z.object({
  project: z.string().optional().describe("Project name to list guilds for a specific bot (omit to list from default bot)"),
});

export const listGuilds: ToolDefinition = {
  name: "list_guilds",
  description: "List all guilds (servers) the bot has access to. Pass project to use a specific bot token.",
  category: "guilds",
  inputSchema,
  handle: async (input, ctx) => {
    const token = input.project ? getTokenForProject(input.project, ctx.config) : undefined;
    const client = await ctx.discord.getClient(token);
    const guilds = client.guilds.cache;

    const result = [...guilds.values()].map((guild) => ({
      id: guild.id,
      name: guild.name,
      member_count: guild.memberCount,
      icon: guild.iconURL(),
      owner_id: guild.ownerId,
    }));

    return toolResultJson({
      count: result.length,
      guilds: result,
    });
  },
};
