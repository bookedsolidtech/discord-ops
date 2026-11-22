import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { snowflakeId } from "../schema.js";
import { approvalEmojiText, describeApprovers, findApprover } from "../../posts/approval.js";
import { readLedger, updateLedger, type LedgerRecord } from "../../posts/ledger.js";
import { isCountingCubes, payloadSha256 } from "../../posts/render.js";
import { PostValidationError, parsePost } from "../../posts/schema.js";
import {
  SendError,
  assertVideoStillAvailable,
  buildPayload,
  errorText,
  getProject,
  needsApproval,
  pinPublished,
  previewHeader,
  previewMismatch,
  publishPayload,
  resolveAliasOrThrow,
  resolvePostTarget,
  resolvePresetOrThrow,
} from "../../posts/service.js";
import { projectField } from "./shared.js";

const TOOL = "publish_post";

const inputSchema = z.object({
  project: projectField,
  preview_message_id: snowflakeId.describe("Preview message id returned by preview_post"),
});

function findPreview(records: LedgerRecord[], previewId: string): LedgerRecord | undefined {
  return records.find((r) => r.via === "preview" && r.preview_message_id === previewId);
}

function assertPublishable(record: LedgerRecord | undefined, previewId: string, project: string) {
  if (!record) {
    throw new PostValidationError(
      `No preview ${previewId} in the posts ledger for project "${project}" — run preview_post first`,
    );
  }
  if (record.status === "published") {
    throw new PostValidationError(
      `Preview ${previewId} was already published as message ${record.published_message_id}`,
    );
  }
  if (record.status === "publishing") {
    throw new PostValidationError(
      `Preview ${previewId} is already being published (claimed ${record.claimed_at}). If that publish ` +
        "was interrupted, check the target channel; to post again, run preview_post for a fresh preview.",
    );
  }
  return record;
}

export const publishPost = defineTool({
  name: TOOL,
  description:
    "SMP posting kit: publish a pending preview to its target as the persona. Unless the post type is in " +
    "posts.auto_types, an approver (posts.approver_user_ids, project owners, or a member with " +
    "posts.approver_role_ids) must have reacted ✅ on this preview message — every post, every time; bot " +
    "reactions never count. The post is re-rendered and must match the previewed payload hash, and the " +
    "preview message must still match it (same persona webhook, unedited), so a config, ledger, or message " +
    "change after preview is refused. forum_post creates the forum thread (as the persona via webhook, else " +
    "as the bot). pin: true pins the published post. Allowed even when posts.require_approval is set.",
  category: "posts",
  inputSchema,
  permissions: ["ManageWebhooks"],
  requiresGuild: true,
  destructive: true,
  gatesOwnChannels: true,
  handle: async (input, ctx) => {
    try {
      const project = getProject(ctx, input.project);
      const ledger = readLedger(project.name);
      const record = assertPublishable(
        findPreview(ledger.records, input.preview_message_id),
        input.preview_message_id,
        project.name,
      );

      // Re-render from the stored post with the CURRENT preset and routing;
      // it must reproduce exactly what the approver saw.
      const post = parsePost(record.post);
      const preset = resolvePresetOrThrow(project, record.persona);
      const target = await resolvePostTarget(ctx, project, post, preset, TOOL);
      const og = record.og ?? undefined;
      const { sha256 } = buildPayload(post, preset, target.channelId, og);
      if (
        sha256 !== record.payload_sha256 ||
        payloadSha256(record.payload) !== record.payload_sha256
      ) {
        throw new PostValidationError(
          "Refusing to publish: the post no longer renders to the previewed payload (persona preset, channel " +
            "routing, or ledger changed since preview). Run preview_post again and get a fresh approval.",
        );
      }

      // Always re-read the preview: publishing must refuse a deleted or
      // changed preview even for auto types that need no reaction.
      if (!record.preview_channel_id) {
        throw new PostValidationError(
          "Ledger record has no preview channel — run preview_post again",
        );
      }
      const previewToken = (
        await resolveAliasOrThrow(
          ctx,
          project,
          project.posts.previewChannel,
          "Preview channel",
          TOOL,
        )
      ).token;
      const channel = await ctx.discord.getChannel(record.preview_channel_id, previewToken);
      let message;
      try {
        // force: the client has no reaction intent, so a cached copy never
        // learns about the ✅ — always read the message fresh from the API.
        message = await channel.messages.fetch({ message: input.preview_message_id, force: true });
      } catch {
        throw new PostValidationError(
          `Preview message ${input.preview_message_id} could not be fetched (deleted?) — run preview_post again`,
        );
      }
      const mismatch = previewMismatch(message, {
        webhookId: record.preview_webhook_id,
        username: record.payload.username,
        content: record.payload.content ?? "",
        embeds: record.payload.embeds,
      });
      if (mismatch) {
        throw new PostValidationError(
          `Refusing to publish: ${mismatch}, so the preview no longer shows this payload. Run preview_post again.`,
        );
      }

      // The header carries what the preview body cannot show — target, thread
      // name, tags, pin — so it must still match what publishing will do.
      let header;
      try {
        header = record.header_message_id
          ? await channel.messages.fetch({ message: record.header_message_id, force: true })
          : undefined;
      } catch {
        header = undefined;
      }
      // Bind the header to THIS preview: it must be the message immediately
      // before the approved one, so a ledger pointing at another preview's
      // header (another destination) is refused.
      let adjacent = false;
      if (header) {
        try {
          const next = await channel.messages.fetch({ after: header.id, limit: 1 });
          adjacent = [...next.keys()][0] === input.preview_message_id;
        } catch {
          adjacent = false;
        }
      }
      const headerMismatch = !header
        ? "the preview header message is missing"
        : !adjacent
          ? "the preview header is not the message right before the approved preview"
          : previewMismatch(header, {
              webhookId: record.preview_webhook_id,
              username: record.payload.username,
              content: previewHeader(target.label, record.payload, {
                channelId: target.channelId,
                project: project.name,
              }),
              embeds: [],
            })?.replace("the preview", "the preview header");
      if (headerMismatch) {
        throw new PostValidationError(
          `Refusing to publish: ${headerMismatch}, so the approved ` +
            "target, thread, or pin no longer matches. Run preview_post again.",
        );
      }

      let approvedBy: string | null = null;
      // Fresh lookup BEFORE the approval decision: the uploader identity comes
      // from YouTube now, not only from the ledger copy, so a rewritten ledger
      // cannot drop a Counting Cubes classification and skip the ✅.
      const freshVideo = await assertVideoStillAvailable(post);
      const countingCubes =
        isCountingCubes(post, preset, og) || isCountingCubes(post, preset, freshVideo);
      if (needsApproval(project, post.type, countingCubes)) {
        const guild = await ctx.discord.getGuild(project.config.guild_id, previewToken);
        const result = await findApprover(message, guild, project.posts);
        if (!result.approved) {
          return toolResult(
            `Not approved: ${result.reason}. ` +
              (countingCubes
                ? `Every Counting Cubes post needs an approver's ${approvalEmojiText(project.posts)} on its own preview. `
                : `Every "${post.type}" post needs an approver's ${approvalEmojiText(project.posts)} on its own preview ` +
                  "(the type is not in posts.auto_types). ") +
              `${describeApprovers(project.posts)} must react ${approvalEmojiText(project.posts)} on preview message ` +
              `${input.preview_message_id} in the preview channel, then call publish_post again.`,
            true,
          );
        }
        approvedBy = result.approvedBy;
      }

      // Cross-process claim: only one MCP process can move pending → publishing.
      const claimedAt = new Date().toISOString();
      await updateLedger(project.name, (fresh) => {
        const stored = assertPublishable(
          findPreview(fresh.records, input.preview_message_id),
          input.preview_message_id,
          project.name,
        );
        if (stored.payload_sha256 !== record.payload_sha256) {
          throw new PostValidationError(
            "Refusing to publish: the ledger record changed while publishing — run preview_post again",
          );
        }
        stored.status = "publishing";
        stored.claimed_at = claimedAt;
      });

      let sent;
      try {
        sent = await publishPayload(ctx, target, record.payload);
      } catch (err) {
        if (!(err instanceof SendError) || err.delivered === "unknown") {
          // The post may be live — keep the claim so a retry cannot double-post.
          throw new PostValidationError(
            `Publishing preview ${input.preview_message_id} failed with an unknown outcome (${errorText(err)}). ` +
              `The post may be live in ${record.target_channel}; the ledger keeps it claimed so it cannot be ` +
              "published twice. Check the channel; if it is not there, run preview_post again.",
          );
        }
        // Discord rejected it, or it never left this process — release the claim so it can be retried.
        await updateLedger(project.name, (fresh) => {
          const stored = findPreview(fresh.records, input.preview_message_id);
          if (stored?.status === "publishing" && stored.claimed_at === claimedAt) {
            stored.status = "pending";
            stored.claimed_at = null;
          }
        }).catch(() => undefined);
        throw err;
      }

      const pinError = record.payload.pin ? await pinPublished(ctx, sent, target.token) : undefined;

      const now = new Date().toISOString();
      let ledgerWarning: string | undefined;
      try {
        await updateLedger(project.name, (fresh) => {
          const stored = findPreview(fresh.records, input.preview_message_id);
          if (stored) {
            stored.status = "published";
            stored.approved_by = approvedBy;
            stored.published_message_id = sent.id;
            stored.published_at = now;
          }
        });
      } catch (err) {
        // The post is live; report it rather than an error that invites a retry.
        ledgerWarning =
          `Published, but the posts ledger could not be updated (${errorText(err)}). The record stays ` +
          `"publishing", which blocks a duplicate publish.`;
      }

      return toolResultJson({
        published: true,
        message_id: sent.id,
        channel_id: sent.channelId,
        ...(sent.thread_id ? { thread_id: sent.thread_id, posted_via: sent.via } : {}),
        target_channel: record.target_channel,
        type: post.type,
        persona: record.payload.username,
        approved_by: approvedBy,
        ...(record.payload.pin
          ? { pinned: !pinError, ...(pinError ? { pin_error: pinError } : {}) }
          : {}),
        ...(ledgerWarning ? { ledger_warning: ledgerWarning } : {}),
      });
    } catch (err) {
      return toolResult(errorText(err), true);
    }
  },
});
