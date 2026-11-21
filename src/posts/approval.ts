import { ReactionType } from "discord.js";
import type { ResolvedPostsConfig } from "../config/personas.js";

/** The reaction an approver adds to a preview to approve it. */
export const APPROVAL_EMOJI = "✅";

/** Minimal structural views of the discord.js objects approval needs (keeps this testable). */
interface ReactionUser {
  id: string;
  bot?: boolean | null;
}
interface ReactionLike {
  emoji: { name: string | null; toString(): string };
  users: {
    fetch(options?: {
      limit?: number;
      after?: string;
      type?: ReactionType;
    }): Promise<{ values(): Iterable<ReactionUser> }>;
  };
}
export interface ApprovalMessage {
  reactions?: { cache?: { values(): Iterable<ReactionLike> } };
}
export interface ApprovalGuild {
  members: {
    fetch(userId: string): Promise<{ roles: { cache: { has(roleId: string): boolean } } }>;
  };
}

/** Upper bound on reaction-user pages walked (100 users each). */
const MAX_REACTION_PAGES = 10;

export type ApprovalResult =
  | { approved: true; approvedBy: string; via: "user" | "role" }
  | { approved: false; reason: string };

/**
 * Decides whether a preview message carries an approver's ✅.
 *
 * Bots never count (the bot itself and other agents cannot self-approve).
 * Approvers are the posts config's approver_user_ids plus the project's
 * owners, plus any guild member holding one of approver_role_ids. A display
 * name is never consulted — only user ids and role membership.
 */
export async function findApprover(
  message: ApprovalMessage,
  guild: ApprovalGuild,
  posts: ResolvedPostsConfig,
): Promise<ApprovalResult> {
  const reactions = [...(message.reactions?.cache?.values() ?? [])];
  const check = reactions.find(
    (r) => r.emoji.name === APPROVAL_EMOJI || r.emoji.toString() === APPROVAL_EMOJI,
  );
  if (!check) {
    return { approved: false, reason: `no ${APPROVAL_EMOJI} reaction on the preview yet` };
  }

  const approverIds = new Set(posts.approverUserIds);
  const nonApprovers = new Set<string>();
  let sawHuman = false;
  let after: string | undefined;

  // Discord pages reaction users 100 at a time (ordered by user id) and lists
  // normal and super (burst) reactions separately — walk both, page by page.
  for (const type of [ReactionType.Normal, ReactionType.Burst]) {
    after = undefined;
    for (let page = 0; page < MAX_REACTION_PAGES; page++) {
      const batch: ReactionUser[] = [
        ...(await check.users.fetch({ type, limit: 100, ...(after ? { after } : {}) })).values(),
      ];
      for (const user of batch) {
        if (user.bot) continue;
        sawHuman = true;
        if (approverIds.has(user.id)) return { approved: true, approvedBy: user.id, via: "user" };
        if (posts.approverRoleIds.length > 0) {
          let member;
          try {
            member = await guild.members.fetch(user.id);
          } catch {
            member = undefined; // left the guild, or not fetchable — cannot approve
          }
          if (member && posts.approverRoleIds.some((roleId) => member.roles.cache.has(roleId))) {
            return { approved: true, approvedBy: user.id, via: "role" };
          }
        }
        nonApprovers.add(user.id);
      }
      if (batch.length < 100) break;
      after = batch[batch.length - 1]!.id;
    }
  }

  if (!sawHuman) {
    return {
      approved: false,
      reason: `the only ${APPROVAL_EMOJI} reactions are from bots — bots cannot approve posts`,
    };
  }
  const ids = [...nonApprovers];
  const shown = ids.slice(0, 10).join(", ");
  return {
    approved: false,
    reason: `${APPROVAL_EMOJI} reactions are from non-approvers (${shown}${ids.length > 10 ? ", …" : ""})`,
  };
}

/** Human-readable statement of who may approve, for error messages. */
export function describeApprovers(posts: ResolvedPostsConfig): string {
  const parts: string[] = [];
  if (posts.approverUserIds.length) {
    parts.push(posts.approverUserIds.map((id) => `<@${id}>`).join(", "));
  }
  if (posts.approverRoleIds.length) {
    parts.push(`a member with role ${posts.approverRoleIds.map((id) => `<@&${id}>`).join(" or ")}`);
  }
  return parts.length
    ? parts.join(" or ")
    : "nobody (configure posts.approver_user_ids, approver_role_ids, or owners)";
}
