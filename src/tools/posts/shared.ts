import { z } from "zod";
import { PostSchema } from "../../posts/schema.js";

export const projectField = z
  .string()
  .min(1)
  .describe("Project name — selects the persona presets, channels, approvers, and posts ledger");

export const postField = PostSchema.describe(
  "The post. `type` is one of welcome, rules, announcement, video_upload, server_status, event, " +
    "schedule_update, build_spotlight, character_line, custom, forum_post. Every post has `persona` " +
    "(preset key or name), a target `channel` (exact alias) or `channel_id` (defaults to the preset's " +
    "default_channel), and optional `pin`.",
);

export const VIDEO_NOTE =
  "video_upload looks the video up with YouTube oEmbed and refuses private, deleted, or unavailable videos " +
  '(missing title, or a title like "Video unavailable"). It CANNOT detect unlisted or scheduled videos: ' +
  "Counting Cubes videos (series, persona, or uploading channel mentioning Counting Cubes) require " +
  "confirm_public: true and an approver's ✅ every time (never send_post, even if video_upload is in " +
  "posts.auto_types), and must never be pre-announced or posted while scheduled, premiere-pending, or " +
  "unlisted.";
