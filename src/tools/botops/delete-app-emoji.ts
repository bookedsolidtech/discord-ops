import { z } from "zod";
import { toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { defineBotopsTool, getApplicationForProject } from "./shared.js";

const inputSchema = z.object({
  project: z
    .string()
    .optional()
    .describe(
      "Project name — the project's bot token selects whose application the emoji is deleted from",
    ),
  emoji_id: snowflakeId.describe("ID of the application emoji to delete"),
});

export const deleteAppEmoji = defineBotopsTool({
  name: "delete_app_emoji",
  description:
    "Delete an application-owned emoji from the bot serving this project. This is irreversible — messages already using the emoji will show a broken reference.",
  category: "botops",
  inputSchema,
  destructive: true,
  handle: async (input, ctx) => {
    const resolved = await getApplicationForProject(input.project, ctx);
    if ("error" in resolved) {
      return toolResult(resolved.error, true);
    }

    await resolved.app.emojis.delete(input.emoji_id);

    return toolResultJson({
      deleted: true,
      emoji_id: input.emoji_id,
    });
  },
});
