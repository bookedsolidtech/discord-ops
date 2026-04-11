import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";

const inputSchema = z.object({});

export const listBots = defineTool({
  name: "list_bots",
  description:
    "List all configured bot personas with their identity metadata, project assignments, and channel overrides. Does not expose token values.",
  category: "system",
  inputSchema,
  handle: async (_input, ctx) => {
    const bots = ctx.config.global.bots;

    if (!bots || Object.keys(bots).length === 0) {
      return toolResultJson({
        bot_count: 0,
        bots: [],
        message:
          "No bot personas configured. Bots are defined in the 'bots' section of the config.",
      });
    }

    const botEntries = Object.entries(bots).map(([key, bot]) => {
      // Find which projects reference this bot
      const projectRefs: string[] = [];
      const channelOverrides: Array<{ project: string; channel: string }> = [];

      for (const [projectName, project] of Object.entries(ctx.config.global.projects)) {
        if (project.bot === key) {
          projectRefs.push(projectName);
        }

        for (const [alias, channelConfig] of Object.entries(project.channels)) {
          if (typeof channelConfig === "object" && channelConfig.bot === key) {
            channelOverrides.push({ project: projectName, channel: alias });
          }
        }
      }

      return {
        key,
        name: bot.name,
        role: bot.role ?? null,
        description: bot.description ?? null,
        default_profile: bot.default_profile ?? null,
        token_set: !!process.env[bot.token_env],
        projects: projectRefs,
        channel_overrides: channelOverrides,
      };
    });

    return toolResultJson({
      bot_count: botEntries.length,
      bots: botEntries,
    });
  },
});
