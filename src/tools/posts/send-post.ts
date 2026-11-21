import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { updateLedger } from "../../posts/ledger.js";
import { PostValidationError, parsePost } from "../../posts/schema.js";
import {
  SendError,
  errorText,
  getProject,
  needsApproval,
  pinPublished,
  preparePost,
  publishPayload,
} from "../../posts/service.js";
import { VIDEO_NOTE, postField, projectField } from "./shared.js";

const inputSchema = z.object({
  project: projectField,
  post: postField,
});

export const sendPost = defineTool({
  name: "send_post",
  description:
    "SMP posting kit: publish a post directly, without a preview or ✅. Allowed only for post types listed in " +
    "the project's posts.auto_types (default: none), and never for Counting Cubes posts. Anything else is " +
    "refused with a pointer to " +
    "preview_post → approver ✅ → publish_post. Allowed even when posts.require_approval is set. " +
    VIDEO_NOTE,
  category: "posts",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  gatesOwnChannels: true,
  handle: async (input, ctx) => {
    try {
      const project = getProject(ctx, input.project);
      const type = parsePost(input.post).type;
      if (needsApproval(project, type)) {
        throw new PostValidationError(
          `"${type}" is not in posts.auto_types for project "${project.name}", so it needs an approver's ✅ — ` +
            "use preview_post, get the ✅ on the preview, then publish_post",
        );
      }

      const prepared = await preparePost(ctx, project, input.post, "send_post");
      // Counting Cubes content is never auto-posted, even if its type is in auto_types:
      // every Counting Cubes post needs an approver's ✅ on a preview.
      if (prepared.countingCubes) {
        throw new PostValidationError(
          "Counting Cubes posts always need an approver's ✅ and cannot use send_post — " +
            "use preview_post, get the ✅ on the preview, then publish_post",
        );
      }
      let sent;
      try {
        sent = await publishPayload(ctx, prepared.target, prepared.payload);
      } catch (err) {
        if (err instanceof SendError && err.delivered === "unknown") {
          throw new PostValidationError(
            `send_post failed with an unknown outcome (${errorText(err)}) — the post may be live in ` +
              `${prepared.target.label}. Check the channel before retrying.`,
          );
        }
        throw err;
      }
      const pinError = prepared.payload.pin
        ? await pinPublished(ctx, sent, prepared.target.token)
        : undefined;

      const now = new Date().toISOString();
      let ledgerWarning: string | undefined;
      await updateLedger(project.name, (ledger) => {
        ledger.records.push({
          id: sent.id,
          preview_message_id: null,
          preview_channel_id: null,
          preview_webhook_id: null,
          header_message_id: null,
          type,
          persona: prepared.post.persona,
          preset_key: prepared.preset.key,
          target_channel: prepared.target.label,
          target_channel_id: prepared.target.channelId,
          post: prepared.post as Record<string, unknown>,
          og: prepared.og ?? null,
          payload: prepared.payload,
          payload_sha256: prepared.sha256,
          created_at: now,
          status: "published",
          claimed_at: null,
          needs_approval: false,
          approved_by: null,
          published_message_id: sent.id,
          published_at: now,
          via: "send_post",
        });
      }).catch((err: unknown) => {
        // The post is live; report it rather than an error that invites a retry.
        ledgerWarning = `Published, but the posts ledger could not be updated (${errorText(err)})`;
      });

      return toolResultJson({
        published: true,
        message_id: sent.id,
        channel_id: sent.channelId,
        ...(sent.thread_id ? { thread_id: sent.thread_id, posted_via: sent.via } : {}),
        target_channel: prepared.target.label,
        type,
        persona: prepared.payload.username,
        ...(prepared.payload.pin
          ? { pinned: !pinError, ...(pinError ? { pin_error: pinError } : {}) }
          : {}),
        ...(ledgerWarning ? { ledger_warning: ledgerWarning } : {}),
      });
    } catch (err) {
      return toolResult(errorText(err), true);
    }
  },
});
