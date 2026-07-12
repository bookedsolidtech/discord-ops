import { z } from "zod";
import { toolResult, toolResultJson } from "../types.js";
import { defineBotopsTool, emojiIdentifier, getApplicationForProject } from "./shared.js";
import { fetchImageAsDataUri, MAX_EMOJI_BYTES } from "./image-fetch.js";

const inputSchema = z.object({
  project: z
    .string()
    .optional()
    .describe(
      "Project name — the project's bot token selects whose application the emoji is added to",
    ),
  name: z
    .string()
    .regex(
      /^[a-zA-Z0-9_]{2,32}$/,
      "Emoji name must be 2-32 characters: letters, digits, or underscores",
    )
    .describe("Emoji name (2-32 chars, alphanumeric/underscore)"),
  image_url: z
    .string()
    .max(2048)
    .describe(
      "Public HTTP(S) URL of the emoji image — fetched server-side (max 256KB, png/jpeg/gif/webp) and converted to a data URI. Private/internal URLs are rejected.",
    ),
});

export const createAppEmoji = defineBotopsTool({
  name: "create_app_emoji",
  description:
    "Create an application-owned emoji for the bot serving this project (max 256KB image). Application emojis work in any message or reaction this app sends, in every guild, and consume no guild emoji slots. Returns the identifier (e.g. <:name:id>) to pass to add_reaction or embed in message content.",
  category: "botops",
  inputSchema,
  handle: async (input, ctx) => {
    const resolved = await getApplicationForProject(input.project, ctx);
    if ("error" in resolved) {
      return toolResult(resolved.error, true);
    }

    const image = await fetchImageAsDataUri(input.image_url, MAX_EMOJI_BYTES);
    if (!image.ok) {
      return toolResult(`image_url rejected: ${image.error}`, true);
    }

    const emoji = await resolved.app.emojis.create({
      attachment: image.dataUri,
      name: input.name,
    });

    return toolResultJson({
      id: emoji.id,
      name: emoji.name,
      animated: emoji.animated ?? false,
      identifier: emojiIdentifier(emoji),
    });
  },
});
