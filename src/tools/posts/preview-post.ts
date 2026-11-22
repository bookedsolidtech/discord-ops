import { z } from "zod";
import { defineTool, toolResult, toolResultJson, type ToolContext } from "../types.js";
import { approvalEmojiText, describeApprovers } from "../../posts/approval.js";
import { updateLedger, withChannelLock } from "../../posts/ledger.js";
import { PostValidationError } from "../../posts/schema.js";
import {
  errorText,
  getProject,
  needsApproval,
  preparePost,
  previewHeader,
  resolveAliasOrThrow,
  resolvePersonaRoute,
  sendViaRoute,
} from "../../posts/service.js";
import { VIDEO_NOTE, postField, projectField } from "./shared.js";

const inputSchema = z.object({
  project: projectField,
  post: postField,
});

export interface PreviewOutcome {
  preview_message_id: string;
  preview_channel_id: string;
  header_message_id: string;
  type: string;
  persona: string;
  target_channel: string;
  needs_approval: boolean;
  payload_sha256: string;
  next_step: string;
}

/**
 * Renders a post and posts it to the project's preview channel as the
 * persona — a "PREVIEW → …" header message, then the exact payload that
 * publish_post will send — and records it as pending. Shared by
 * preview_post and preview_posts.
 */
export async function previewOne(
  ctx: ToolContext,
  projectName: string,
  rawPost: unknown,
  toolName = "preview_post",
): Promise<PreviewOutcome> {
  const project = getProject(ctx, projectName);
  const prepared = await preparePost(ctx, project, rawPost, toolName);
  const preview = await resolveAliasOrThrow(
    ctx,
    project,
    project.posts.previewChannel,
    "Preview channel",
    toolName,
  );
  if (preview.channelId === prepared.target.channelId) {
    throw new PostValidationError("The preview channel cannot also be the post's target channel");
  }

  const identity = {
    username: prepared.payload.username,
    avatar_url: prepared.payload.avatar_url,
  };
  // The header and the preview must be adjacent, from one webhook: publish
  // binds the approved preview to its header by "the next message after the
  // header". A lock on the preview channel keeps concurrent previews (other
  // sessions, or other projects sharing the channel) from interleaving.
  const { header, sent } = await withChannelLock(preview.channelId, async () => {
    const route = await resolvePersonaRoute(ctx, preview.channelId, preview.token);
    const header = await sendViaRoute(route, {
      ...identity,
      content: previewHeader(prepared.target.label, prepared.payload, {
        channelId: prepared.target.channelId,
        project: project.name,
      }),
      embeds: [],
    });
    const sent = await sendViaRoute(route, {
      ...identity,
      content: prepared.payload.content,
      embeds: prepared.payload.embeds,
    });
    return { header, sent };
  });

  const approval = needsApproval(project, prepared.post.type, prepared.countingCubes);
  const now = new Date().toISOString();
  try {
    await updateLedger(project.name, (ledger) => {
      ledger.records.push({
        id: sent.id,
        preview_message_id: sent.id,
        preview_channel_id: preview.channelId,
        preview_webhook_id: sent.webhookId,
        header_message_id: header.id,
        type: prepared.post.type,
        persona: prepared.post.persona,
        preset_key: prepared.preset.key,
        target_channel: prepared.target.label,
        target_channel_id: prepared.target.channelId,
        post: prepared.post as Record<string, unknown>,
        og: prepared.og ?? null,
        payload: prepared.payload,
        payload_sha256: prepared.sha256,
        created_at: now,
        status: "pending",
        claimed_at: null,
        needs_approval: approval,
        approved_by: null,
        published_message_id: null,
        published_at: null,
        via: "preview",
      });
    });
  } catch (err) {
    throw new PostValidationError(
      `Preview ${sent.id} was posted but could not be recorded in the posts ledger (${errorText(err)}). ` +
        "Delete that preview message and run preview_post again.",
    );
  }

  const publishCall = `publish_post { project: "${project.name}", preview_message_id: "${sent.id}" }`;
  return {
    preview_message_id: sent.id,
    preview_channel_id: preview.channelId,
    header_message_id: header.id,
    type: prepared.post.type,
    persona: prepared.payload.username,
    target_channel: prepared.target.label,
    needs_approval: approval,
    payload_sha256: prepared.sha256,
    next_step: approval
      ? `${describeApprovers(project.posts)} must react ${approvalEmojiText(project.posts)} on preview message ${sent.id}, then call ${publishCall}`
      : `"${prepared.post.type}" is in posts.auto_types — call ${publishCall} (no reaction needed), or post directly with send_post`,
  };
}

export const previewPost = defineTool({
  name: "preview_post",
  description:
    "SMP posting kit: render a typed post and post it to the project's preview channel (posts.preview_channel, " +
    'default alias "feed-preview") as the persona: a "PREVIEW → <target> · <type>" header message, then the ' +
    "post exactly as it will be published. Records it as pending in the local posts ledger and returns " +
    "preview_message_id. Unless the type is in posts.auto_types, an approver must react ✅ on that preview " +
    "message before publish_post will publish it — every post, every time. Counting Cubes posts always need " +
    "the ✅, whatever auto_types says. " +
    VIDEO_NOTE,
  category: "posts",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  gatesOwnChannels: true,
  handle: async (input, ctx) => {
    try {
      return toolResultJson(await previewOne(ctx, input.project, input.post));
    } catch (err) {
      return toolResult(errorText(err), true);
    }
  },
});
