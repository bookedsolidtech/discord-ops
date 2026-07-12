import { z } from "zod";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { defineBotopsTool, resolveGuildTarget } from "./shared.js";

const inputSchema = z.object({
  guild_id: snowflakeId.optional().describe("Guild ID — overrides project-based guild routing"),
  project: z
    .string()
    .optional()
    .describe(
      "Project name — resolves the guild and selects which bot's nickname is changed (the bot serving this project)",
    ),
  nick: z
    .string()
    .max(32, "Nickname must be at most 32 characters")
    .nullable()
    .describe("New per-guild nickname (1-32 chars). Pass null or an empty string to clear it."),
});

export const setBotNick = defineBotopsTool({
  name: "set_bot_nick",
  description:
    "Set or clear the bot's own per-guild nickname (the bot serving this project). Changes only how the bot appears in that guild — the global application name is untouched. Requires the ChangeNickname permission.",
  category: "botops",
  inputSchema,
  permissions: ["ChangeNickname"],
  requiresGuild: true,
  handle: async (input, ctx) => {
    const target = resolveGuildTarget(input, ctx.config);
    if ("error" in target) {
      return toolResult(target.error, true);
    }

    // Empty or whitespace-only nick means "clear", same as null.
    const nick = input.nick && input.nick.trim() !== "" ? input.nick : null;

    const guild = await ctx.discord.getGuild(target.guildId, target.token);
    const me = guild.members.me ?? (await guild.members.fetchMe());
    await me.setNickname(nick);

    return toolResultJson({
      guild_id: target.guildId,
      nick,
    });
  },
});
