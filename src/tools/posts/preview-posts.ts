import { z } from "zod";
import { defineTool, toolResultJson } from "../types.js";
import { errorText } from "../../posts/service.js";
import { previewOne } from "./preview-post.js";
import { VIDEO_NOTE, projectField } from "./shared.js";

const inputSchema = z.object({
  project: projectField,
  posts: z
    .array(z.record(z.string(), z.unknown()))
    .min(1)
    .max(10)
    .describe(
      "Up to 10 posts, each the same shape as preview_post's `post`. Items are validated one by one so a " +
        "bad item does not block the rest",
    ),
});

export const previewPosts = defineTool({
  name: "preview_posts",
  description:
    "SMP posting kit: batch preview_post for up to 10 posts in one project. Each item is validated, rendered, " +
    "posted to the preview channel, and recorded independently; an item error is reported in its result and " +
    "the batch continues. " +
    VIDEO_NOTE,
  category: "posts",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  gatesOwnChannels: true,
  handle: async (input, ctx) => {
    const results = [];
    for (const [index, post] of input.posts.entries()) {
      try {
        results.push({
          index,
          ok: true,
          ...(await previewOne(ctx, input.project, post, "preview_posts")),
        });
      } catch (err) {
        results.push({ index, ok: false, error: errorText(err) });
      }
    }
    const failed = results.filter((r) => !r.ok).length;
    return toolResultJson(
      {
        project: input.project,
        previewed: results.length - failed,
        failed,
        results,
      },
      failed === results.length,
    );
  },
});
