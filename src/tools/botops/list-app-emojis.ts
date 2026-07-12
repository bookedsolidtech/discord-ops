import { z } from "zod";
import { toolResult, toolResultJson } from "../types.js";
import { defineBotopsTool, emojiIdentifier, getApplicationForProject } from "./shared.js";

const inputSchema = z.object({
  project: z
    .string()
    .optional()
    .describe("Project name — the project's bot token selects whose application emojis are listed"),
});

export const listAppEmojis = defineBotopsTool({
  name: "list_app_emojis",
  description:
    "List the application-owned emojis of the bot serving this project. Application emojis are usable in any message or reaction this app sends — in every guild — and consume no guild emoji slots. The returned identifier (e.g. <:name:id>) is what agents pass to add_reaction or embed in message content.",
  category: "botops",
  inputSchema,
  handle: async (input, ctx) => {
    const resolved = await getApplicationForProject(input.project, ctx);
    if ("error" in resolved) {
      return toolResult(resolved.error, true);
    }

    const emojis = await resolved.app.emojis.fetch();
    const items = emojis.map((emoji) => ({
      id: emoji.id,
      name: emoji.name,
      animated: emoji.animated ?? false,
      identifier: emojiIdentifier(emoji),
    }));

    return toolResultJson({
      application_id: resolved.app.id,
      count: items.length,
      emojis: items,
    });
  },
});
