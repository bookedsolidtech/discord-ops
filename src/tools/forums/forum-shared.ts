import { ChannelType, type ForumChannel } from "discord.js";
import type { ToolCategory } from "../types.js";

/**
 * Category for forum work-queue tools.
 *
 * INTEGRATOR NOTE: "forums" is not yet a member of the ToolCategory union in
 * src/tools/types.ts. Add `| "forums"` to that union when wiring these tools
 * into src/tools/index.ts, then this cast becomes a no-op. The double cast is
 * deliberate: this branch must not modify existing files.
 */
export const FORUMS_CATEGORY = "forums" as unknown as ToolCategory;

/** Minimal structural view of a forum channel — keeps helpers mock-friendly. */
export interface ForumLike {
  id: string;
  availableTags: Array<{ id: string; name: string }>;
}

/**
 * Validates that a resolved channel is a GuildForum (type 15), returning a
 * clear error naming the actual type otherwise. discord.js getChannel() only
 * returns text-based channels (forums are not), so forum tools must resolve
 * channels via getAnyChannel() and narrow here.
 */
export function asForumChannel(
  channel: { id: string; type: number },
  channelId: string,
): { forum: ForumChannel } | { error: string } {
  if (channel.type !== ChannelType.GuildForum) {
    const actual = ChannelType[channel.type] ?? String(channel.type);
    return {
      error:
        `Channel ${channelId} is not a forum channel (actual type: ${actual}). ` +
        "Forum tools require a GuildForum channel (type 15).",
    };
  }
  return { forum: channel as ForumChannel };
}

/**
 * Resolves tag names to tag IDs against a forum's available_tags.
 * Exact match first, then case-insensitive. On any miss, errors with the
 * full list of available tag names so agents can self-correct.
 */
export function resolveTagNames(
  forum: ForumLike,
  names: string[],
): { ids: string[] } | { error: string } {
  const ids: string[] = [];
  for (const name of names) {
    const tag =
      forum.availableTags.find((t) => t.name === name) ??
      forum.availableTags.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (!tag) {
      const available = forum.availableTags.map((t) => t.name);
      return {
        error:
          `Tag "${name}" not found in forum ${forum.id}. ` +
          (available.length > 0
            ? `Available tags: ${available.join(", ")}`
            : "This forum has no tags configured."),
      };
    }
    ids.push(tag.id);
  }
  return { ids };
}

/**
 * Maps applied tag IDs back to names. Unknown IDs (e.g. a tag deleted after
 * being applied) fall back to the raw ID rather than being dropped.
 */
export function tagIdsToNames(forum: ForumLike, ids: readonly string[]): string[] {
  return ids.map((id) => forum.availableTags.find((t) => t.id === id)?.name ?? id);
}

/** Shared post summary shape for list_forum_posts and update_forum_post. */
export function serializeForumPost(
  forum: ForumLike,
  thread: {
    id: string;
    name: string;
    appliedTags?: readonly string[];
    archived: boolean | null;
    messageCount: number | null;
    createdAt: Date | null;
  },
) {
  return {
    thread_id: thread.id,
    title: thread.name,
    tags: tagIdsToNames(forum, thread.appliedTags ?? []),
    archived: thread.archived ?? false,
    message_count: thread.messageCount ?? 0,
    created_at: thread.createdAt?.toISOString() ?? null,
  };
}
