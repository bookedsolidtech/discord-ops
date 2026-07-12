import { z } from "zod";
import type { ThreadChannel } from "discord.js";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { getTokenForProject, getTokenForChannel } from "../../config/index.js";
import {
  FORUMS_CATEGORY,
  asForumChannel,
  resolveTagNames,
  serializeForumPost,
} from "./forum-shared.js";

const inputSchema = z.object({
  thread_id: snowflakeId.describe("Forum post (thread) ID to update"),
  tags: z
    .array(z.string().min(1))
    .max(5)
    .optional()
    .describe("Replace the post's applied tags with these tag names (max 5)"),
  archived: z.boolean().optional().describe("true archives (completes) the post; false reopens it"),
  project: z.string().optional().describe("Project name for token resolution"),
  channel: z
    .string()
    .optional()
    .describe(
      "Forum channel alias — pass this when the forum has a per-channel bot override so the " +
        "correct bot token is used (matches create_forum_post's routing)",
    ),
});

export const updateForumPost = defineTool({
  name: "update_forum_post",
  description:
    "Update a forum post's tags and/or archived state — the claim/complete mechanic for forum " +
    "work queues. Claim a task by replacing its status tags (e.g. todo -> in-progress), mark it " +
    "done by setting archived: true, or reopen it with archived: false. Tags are given by name, " +
    "resolved against the parent forum's available tags, and REPLACE the current set. Reopening " +
    "happens before retagging, so { tags, archived: false } reactivates an archived post in one " +
    "call. For a forum with a per-channel bot override, pass the SAME project + channel that " +
    "create_forum_post returned so the correct bot token is used; with thread_id alone the " +
    "project default bot is used (which is correct for the common single-bot case).",
  category: FORUMS_CATEGORY,
  inputSchema,
  permissions: ["ManageThreads"],
  handle: async (input, ctx) => {
    if (input.tags === undefined && input.archived === undefined) {
      return toolResult("Nothing to update — provide tags and/or archived", true);
    }

    // Resolve the channel-aware token when a forum alias is given (honors a
    // per-channel bot override, matching create_forum_post); otherwise fall
    // back to the project default token.
    let token: string | undefined;
    if (input.project && input.channel) {
      try {
        token = getTokenForChannel(input.project, input.channel, ctx.config);
      } catch {
        token = getTokenForProject(input.project, ctx.config);
      }
    } else if (input.project) {
      token = getTokenForProject(input.project, ctx.config);
    }
    const channel = await ctx.discord.getAnyChannel(input.thread_id, token);

    if (!("isThread" in channel) || typeof channel.isThread !== "function" || !channel.isThread()) {
      return toolResult(`Channel ${input.thread_id} is not a thread`, true);
    }
    const thread = channel as unknown as ThreadChannel<true>;

    // Resolve the parent forum for tag-name resolution. The cached parent may
    // be null after a restart, so fall back to fetching by parentId.
    const parent =
      thread.parent ??
      (thread.parentId ? await ctx.discord.getAnyChannel(thread.parentId, token) : null);
    if (!parent) {
      return toolResult(`Cannot resolve the parent channel of thread ${input.thread_id}`, true);
    }
    const checked = asForumChannel(parent, parent.id);
    if ("error" in checked) {
      return toolResult(`Thread ${input.thread_id} is not a forum post — ${checked.error}`, true);
    }
    const forum = checked.forum;

    let tagIds: string[] | undefined;
    if (input.tags !== undefined) {
      const resolved = resolveTagNames(forum, input.tags);
      if ("error" in resolved) {
        return toolResult(resolved.error, true);
      }
      tagIds = resolved.ids;
    }

    // Discord rejects edits to archived threads, so reopen first when asked.
    if (input.archived === false && thread.archived) {
      await thread.setArchived(false);
    }
    if (tagIds !== undefined) {
      await thread.setAppliedTags(tagIds);
    }
    if (input.archived === true) {
      await thread.setArchived(true);
    }

    return toolResultJson(
      serializeForumPost(forum, {
        id: thread.id,
        name: thread.name,
        appliedTags: tagIds ?? thread.appliedTags,
        archived: input.archived ?? thread.archived,
        messageCount: thread.messageCount,
        createdAt: thread.createdAt,
      }),
    );
  },
});
