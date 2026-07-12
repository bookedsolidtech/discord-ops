import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { resolveTarget } from "../../routing/resolver.js";
import { FORUMS_CATEGORY, asForumChannel, resolveTagNames, tagIdsToNames } from "./forum-shared.js";

const inputSchema = z.object({
  title: z.string().min(1).max(100).describe("Post title (becomes the thread name)"),
  content: z.string().min(1).max(2000).describe("Initial message content of the post"),
  tags: z
    .array(z.string().min(1))
    .max(5)
    .optional()
    .describe("Tag names to apply, resolved against the forum's available tags (max 5)"),
  auto_archive_duration: z
    .enum(["60", "1440", "4320", "10080"])
    .default("1440")
    .describe("Auto-archive duration in minutes (60, 1440, 4320, 10080)"),
  channel_id: snowflakeId.optional().describe("Direct forum channel ID"),
  guild_id: snowflakeId.optional().describe("Direct guild ID"),
  project: z.string().optional().describe("Project name for routing"),
  channel: z.string().optional().describe("Forum channel alias within project"),
});

export const createForumPost = defineTool({
  name: "create_forum_post",
  description:
    "Create a post in a forum channel — the enqueue primitive for using a forum as a durable " +
    "agent work queue: each post is a task, tags are its status/labels, and archiving marks it " +
    "done. Tags are given by name and resolved against the forum's configured tags (errors list " +
    "the available names). Returns the thread_id to post progress updates into and pass to " +
    "update_forum_post for claiming (retag) and completing (archive).",
  category: FORUMS_CATEGORY,
  inputSchema,
  permissions: ["SendMessages"],
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

    let appliedTags: string[] | undefined;
    if (input.tags && input.tags.length > 0) {
      const resolved = resolveTagNames(forum, input.tags);
      if ("error" in resolved) {
        return toolResult(resolved.error, true);
      }
      appliedTags = resolved.ids;
    }

    const thread = await forum.threads.create({
      name: input.title,
      autoArchiveDuration: Number(input.auto_archive_duration) as 60 | 1440 | 4320 | 10080,
      message: { content: input.content },
      ...(appliedTags ? { appliedTags } : {}),
    });

    return toolResultJson({
      thread_id: thread.id,
      // Discord invariant: a forum post's starter message shares the thread's ID.
      message_id: thread.id,
      title: thread.name,
      applied_tags: tagIdsToNames(forum, thread.appliedTags ?? appliedTags ?? []),
    });
  },
});
