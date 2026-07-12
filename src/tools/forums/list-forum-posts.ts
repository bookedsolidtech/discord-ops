import { z } from "zod";
import type { AnyThreadChannel } from "discord.js";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import {
  FORUMS_CATEGORY,
  asForumChannel,
  resolveTagNames,
  serializeForumPost,
} from "./forum-shared.js";

const inputSchema = z.object({
  tag: z
    .string()
    .min(1)
    .optional()
    .describe("Only return posts carrying this tag (by name, e.g. a status label)"),
  include_archived: z
    .boolean()
    .default(false)
    .describe("Include archived (completed) posts (default false)"),
  channel_id: snowflakeId.optional().describe("Direct forum channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Forum channel alias within project"),
});

export const listForumPosts = defineTool({
  name: "list_forum_posts",
  description:
    "List posts in a forum channel used as an agent work queue — each post is a task, its tags " +
    "are status/labels, archived means done. Filter by tag name to poll for work in a given " +
    'state (e.g. tag: "todo" for unclaimed tasks). Active posts only by default; set ' +
    "include_archived to audit completed work. Returns thread_ids to read, reply to, or pass " +
    "to update_forum_post.",
  category: FORUMS_CATEGORY,
  inputSchema,
  handle: async (input, ctx) => {
    const target = await resolveTarget(input, ctx.config, ctx.discord);
    if ("error" in target) {
      return toolResult(target.error, true);
    }

    // Forums are not text-based, so resolve via getAnyChannel (not getChannel).
    const channel = await ctx.discord.getAnyChannel(target.channelId, target.token);
    const checked = asForumChannel(channel, target.channelId);
    if ("error" in checked) {
      return toolResult(checked.error, true);
    }
    const forum = checked.forum;

    // Resolve the tag filter up front so a typo errors with the available names
    // instead of silently returning zero posts.
    let filterTagId: string | undefined;
    if (input.tag) {
      const resolved = resolveTagNames(forum, [input.tag]);
      if ("error" in resolved) {
        return toolResult(resolved.error, true);
      }
      filterTagId = resolved.ids[0];
    }

    const active = await forum.threads.fetchActive();
    const posts: AnyThreadChannel[] = [...active.threads.values()];

    if (input.include_archived) {
      const archived = await forum.threads.fetchArchived();
      for (const thread of archived.threads.values()) {
        if (!posts.some((t) => t.id === thread.id)) {
          posts.push(thread);
        }
      }
    }

    const tagId = filterTagId;
    const filtered =
      tagId === undefined ? posts : posts.filter((t) => (t.appliedTags ?? []).includes(tagId));

    return toolResultJson({
      channel_id: target.channelId,
      count: filtered.length,
      posts: filtered.map((t) => serializeForumPost(forum, t)),
    });
  },
});
