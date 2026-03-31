import { z } from "zod";
import type { ToolDefinition } from "../types.js";
import { toolResultJson } from "../types.js";

const inputSchema = z.object({});

export const listGuilds: ToolDefinition = {
  name: "list_guilds",
  description: "List all guilds (servers) the bot has access to.",
  category: "guilds",
  inputSchema,
  handle: async (_input, ctx) => {
    const client = await ctx.discord.getClient();
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
