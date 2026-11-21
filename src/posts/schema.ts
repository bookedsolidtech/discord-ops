import { z } from "zod";
import { isPublicHttpUrl } from "../utils/og-fetch.js";
import { personaEmbedSchema } from "../tools/personas/persona-webhook.js";

/**
 * Post inputs for the SMP posting kit — a discriminated union on `type`.
 *
 * Every URL a post carries must be a public https:// URL: Discord's CDN
 * proxy-fetches embed images, so a private or reserved address is an SSRF
 * vector, and plain http has no place on a kids' server feed.
 */

export function isPublicHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:" && isPublicHttpUrl(url);
  } catch {
    return false;
  }
}

const publicHttpsUrl = z.string().max(2048).refine(isPublicHttpsUrl, {
  message: "must be a public https:// URL (private, loopback, and reserved addresses are refused)",
});

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Extracts the video id from a YouTube watch, shorts, live, or youtu.be URL.
 * Returns undefined for anything else (playlists, channels, other hosts).
 */
export function youtubeVideoId(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "https:" || parsed.port !== "") return undefined;
  const host = parsed.hostname.toLowerCase();
  let id: string | null | undefined;
  if (host === "youtu.be") {
    id = parsed.pathname.split("/")[1];
  } else if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") {
    const [, first, second] = parsed.pathname.split("/");
    if (first === "watch") id = parsed.searchParams.get("v");
    else if (first === "shorts" || first === "live") id = second;
  }
  return id && YOUTUBE_ID.test(id) ? id : undefined;
}

const youtubeUrl = z
  .string()
  .max(2048)
  .refine((url) => youtubeVideoId(url) !== undefined, {
    message:
      "must be an https YouTube video URL (youtube.com/watch?v=…, youtube.com/shorts/…, youtube.com/live/…, or youtu.be/…)",
  });

const isoDateTime = z.iso
  .datetime({ offset: true })
  .describe("ISO 8601 date-time with a timezone, e.g. 2026-12-05T19:00:00-05:00");

/** Fields every post carries. */
const base = {
  persona: z
    .string()
    .min(1)
    .max(80)
    .describe("Persona preset key or preset name configured in the project's `personas`"),
  channel: z
    .string()
    .min(1)
    .max(100)
    .optional()
    .describe(
      "Target channel alias in the project (exact alias). Defaults to the persona preset's default_channel",
    ),
  channel_id: z
    .string()
    .regex(/^\d{17,20}$/, "Must be a valid Discord snowflake ID")
    .optional()
    .describe("Target channel ID (instead of channel) — must be in the project's guild"),
  pin: z.boolean().optional().describe("Pin the published post (the bot pins it)"),
  project: z
    .string()
    .optional()
    .describe("Project the post belongs to — must match the tool's project when given"),
};

const section = z.object({
  name: z.string().min(1).max(256),
  value: z.string().min(1).max(1024),
});

const sectionedPost = {
  ...base,
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(4096),
  sections: z.array(section).max(25).optional(),
};

export const WelcomePostSchema = z.object({ type: z.literal("welcome"), ...sectionedPost });
export const RulesPostSchema = z.object({ type: z.literal("rules"), ...sectionedPost });

export const AnnouncementPostSchema = z.object({
  type: z.literal("announcement"),
  ...base,
  title: z.string().min(1).max(256),
  body: z.string().min(1).max(4096),
  image_url: publicHttpsUrl.optional(),
  link_url: publicHttpsUrl.optional(),
});

export const VideoUploadPostSchema = z.object({
  type: z.literal("video_upload"),
  ...base,
  url: youtubeUrl,
  series: z.string().max(100).optional(),
  confirm_public: z
    .boolean()
    .optional()
    .describe(
      "Required true for Counting Cubes: you checked the video is PUBLIC and live — not scheduled, premiere-pending, or unlisted. The tool cannot detect unlisted videos",
    ),
  note: z.string().max(1000).optional().describe("Optional line posted above the video embed"),
});

export const ServerStatusPostSchema = z.object({
  type: z.literal("server_status"),
  ...base,
  state: z.enum(["up", "down", "maintenance"]),
  address: z.string().max(256).optional(),
  version: z.string().max(64).optional(),
  players: z
    .union([z.number().int().min(0), z.string().max(64)])
    .optional()
    .describe('Player count, e.g. 4 or "4/20"'),
  note: z.string().max(1024).optional(),
});

export const EventPostSchema = z
  .object({
    type: z.literal("event"),
    ...base,
    title: z.string().min(1).max(256),
    description: z.string().min(1).max(4096),
    starts_at: isoDateTime,
    ends_at: isoDateTime.optional(),
    location: z.string().max(1024).optional(),
    image_url: publicHttpsUrl.optional(),
  })
  .refine((post) => !post.ends_at || Date.parse(post.ends_at) >= Date.parse(post.starts_at), {
    message: "ends_at must not be before starts_at",
    path: ["ends_at"],
  });

export const BuildSpotlightPostSchema = z.object({
  type: z.literal("build_spotlight"),
  ...base,
  title: z.string().min(1).max(256),
  builder: z.string().min(1).max(256),
  description: z.string().max(4096).optional(),
  image_url: publicHttpsUrl,
});

export const CharacterLinePostSchema = z.object({
  type: z.literal("character_line"),
  ...base,
  line: z.string().min(1).max(2000),
  image_url: publicHttpsUrl.optional(),
});

export const ScheduleUpdatePostSchema = z
  .object({
    type: z.literal("schedule_update"),
    ...base,
    title: z.string().min(1).max(256),
    change: z.string().min(1).max(1000).describe('What changed, e.g. "Build night moves to 7pm"'),
    starts_at: isoDateTime.optional(),
    ends_at: isoDateTime.optional(),
    cancelled: z.boolean().optional(),
    note: z.string().max(1024).optional(),
  })
  .refine(
    (post) =>
      !post.ends_at || !post.starts_at || Date.parse(post.ends_at) >= Date.parse(post.starts_at),
    { message: "ends_at must not be before starts_at", path: ["ends_at"] },
  );

const embeds = z
  .array(personaEmbedSchema)
  .max(10)
  .describe("Embeds (max 10), same shape as send_as; every URL must be public https");

export const CustomPostSchema = z.object({
  type: z.literal("custom"),
  ...base,
  content: z.string().max(2000).optional(),
  embeds: embeds.optional(),
});

export const ForumPostSchema = z.object({
  type: z.literal("forum_post"),
  ...base,
  title: z.string().min(1).max(100).describe("Forum post title (the thread name)"),
  content: z.string().min(1).max(2000),
  embeds: embeds.optional(),
  tags: z
    .array(z.string().min(1).max(20))
    .max(5)
    .optional()
    .describe("Forum tag names, resolved against the target forum's tags"),
});

export const PostSchema = z.discriminatedUnion("type", [
  WelcomePostSchema,
  RulesPostSchema,
  AnnouncementPostSchema,
  VideoUploadPostSchema,
  ServerStatusPostSchema,
  EventPostSchema,
  BuildSpotlightPostSchema,
  CharacterLinePostSchema,
  ScheduleUpdatePostSchema,
  CustomPostSchema,
  ForumPostSchema,
]);

export type Post = z.infer<typeof PostSchema>;
export type PostInput = z.input<typeof PostSchema>;

/** Raised for any post that cannot be rendered or published — the message is agent-facing. */
export class PostValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostValidationError";
  }
}

/** Parses a post, converting zod issues into one readable PostValidationError. */
export function parsePost(input: unknown): Post {
  const result = PostSchema.safeParse(input);
  if (result.success) return result.data;
  const details = result.error.issues
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "post"}: ${issue.message}`)
    .join("; ");
  throw new PostValidationError(`Invalid post — ${details}`);
}
