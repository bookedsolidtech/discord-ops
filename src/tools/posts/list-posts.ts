import { z } from "zod";
import { defineTool, toolResult, toolResultJson } from "../types.js";
import { readLedger, type LedgerRecord } from "../../posts/ledger.js";
import { describeApprovers } from "../../posts/approval.js";
import { errorText, getProject } from "../../posts/service.js";
import { projectField } from "./shared.js";

const inputSchema = z.object({ project: projectField });

function summarize(record: LedgerRecord) {
  return {
    id: record.id,
    preview_message_id: record.preview_message_id,
    type: record.type,
    persona: record.payload.username,
    preset: record.preset_key,
    target_channel: record.target_channel,
    status: record.status,
    via: record.via,
    needs_approval_at_preview: record.needs_approval,
    approved_by: record.approved_by,
    created_at: record.created_at,
    published_message_id: record.published_message_id,
    published_at: record.published_at,
    payload_sha256: record.payload_sha256,
  };
}

export const listPosts = defineTool({
  name: "list_posts",
  description:
    "SMP posting kit: read the project's local posts ledger — pending previews, interrupted publishes (status " +
    "publishing: the post may be live, check the target), and the last 50 published posts " +
    "(newest first). Also reports the preview channel, posts.auto_types (types send_post may post without a " +
    "✅), whether require_approval blocks direct posting, and who can approve. Read-only; does not call Discord.",
  category: "posts",
  inputSchema,
  handle: async (input, ctx) => {
    try {
      const project = getProject(ctx, input.project);
      const ledger = readLedger(project.name);
      const pending = ledger.records.filter((r) => r.status === "pending").map(summarize);
      // Claimed but never confirmed (send timed out or the process died): the
      // post may be live. Listed so a later session can check and recover.
      const publishing = ledger.records
        .filter((r) => r.status === "publishing")
        .map((r) => ({ ...summarize(r), claimed_at: r.claimed_at }));
      const published = ledger.records
        .filter((r) => r.status === "published")
        .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""))
        .slice(0, 50)
        .map(summarize);
      return toolResultJson({
        project: project.name,
        preview_channel: project.posts.previewChannel,
        auto_types: project.posts.autoTypes,
        require_approval: project.posts.requireApproval,
        approvers: describeApprovers(project.posts),
        pending,
        publishing,
        published,
      });
    } catch (err) {
      return toolResult(errorText(err), true);
    }
  },
});
