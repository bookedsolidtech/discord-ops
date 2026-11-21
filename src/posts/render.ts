import { createHash } from "node:crypto";
import type { PersonaPreset } from "../config/schema.js";
import { applyPresetEmbedDefaults } from "../config/personas.js";
import {
  PostValidationError,
  isPublicHttpsUrl,
  parsePost,
  youtubeVideoId,
  type Post,
} from "./schema.js";

/**
 * Pure renderer for SMP posting-kit posts. No network, no clock: the same
 * post + preset + OG snapshot always renders the same payload, which is what
 * lets publish_post re-render and compare against the approved preview hash.
 */

export interface Embed {
  title?: string;
  description?: string;
  url?: string;
  color?: number;
  footer?: { text: string };
  image?: { url: string };
  thumbnail?: { url: string };
  author?: { name: string; url?: string; icon_url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
  timestamp?: string;
}

export interface RenderedPost {
  content?: string;
  embeds: Embed[];
  /** forum_post only: the thread to create in the target forum. */
  thread?: { name: string; tags: string[] };
}

/** OG metadata the tool layer fetched for a video_upload (title/description/image). */
export interface OgSnapshot {
  title?: string;
  description?: string;
  image?: string;
  /** Uploading channel, when the source reports it (YouTube oEmbed does). */
  author_name?: string;
  author_url?: string;
  /** Why the lookup could not confirm the video (private, deleted, unreachable). */
  error?: string;
}

export interface PresetRef {
  key: string;
  preset: PersonaPreset;
}

export interface RenderOptions {
  /** Required for video_upload — fetched by the tool layer (YouTube oEmbed). */
  og?: OgSnapshot;
}

/** Default embed colors per type; a preset color overrides these (except server_status). */
const TYPE_COLORS: Record<Post["type"], number | undefined> = {
  welcome: 0x57f287,
  rules: 0x5865f2,
  announcement: 0xfee75c,
  video_upload: 0xff0000,
  server_status: undefined,
  event: 0xeb459e,
  build_spotlight: 0xf1c40f,
  character_line: undefined,
  schedule_update: undefined,
  custom: undefined,
  forum_post: undefined,
};

/** server_status colors: green / red / amber. State always wins over preset color. */
export const STATUS_COLORS = { up: 0x57f287, down: 0xed4245, maintenance: 0xfaa61a } as const;

/** schedule_update colors: amber for a change, red for a cancellation. Always wins over preset color. */
export const SCHEDULE_COLORS = { changed: 0xfaa61a, cancelled: 0xed4245 } as const;

/** Every URL field a passthrough embed can carry must be public https. */
function assertEmbedUrls(embeds: Embed[]): void {
  for (const [i, embed] of embeds.entries()) {
    const urls: Array<[string, string | undefined]> = [
      ["url", embed.url],
      ["image.url", embed.image?.url],
      ["thumbnail.url", embed.thumbnail?.url],
      ["author.url", embed.author?.url],
      ["author.icon_url", embed.author?.icon_url],
    ];
    for (const [field, url] of urls) {
      if (url !== undefined && !isPublicHttpsUrl(url)) {
        throw new PostValidationError(
          `embeds.${i}.${field} must be a public https:// URL (private, loopback, and reserved addresses are refused): ${url}`,
        );
      }
    }
  }
}

/** Copies passthrough embeds, dropping undefined keys so hashes stay canonical. */
function copyEmbeds(embeds: Embed[] | undefined): Embed[] {
  return (embeds ?? []).map((e) => JSON.parse(JSON.stringify(e)) as Embed);
}

const STATUS_TITLES = {
  up: "\u{1F7E2} Server is online",
  down: "\u{1F534} Server is offline",
  maintenance: "\u{1F7E0} Server maintenance",
} as const;

/** OG titles YouTube serves for videos that cannot be watched. */
const UNAVAILABLE_TITLE_PATTERNS = [
  /^-?\s*youtube$/i,
  /^\[?(video unavailable|private video|deleted video)\]?$/i,
  /^this video (is unavailable|isn't available|is not available)( anymore)?\.?$/i,
];

export function isUnavailableTitle(title: string | undefined): boolean {
  const t = title?.trim() ?? "";
  if (!t) return true;
  return UNAVAILABLE_TITLE_PATTERNS.some((pattern) => pattern.test(t));
}

/** Lowercase alphanumerics only, so "Counting Cubes", "counting_cubes", and "CountingCubes!" all compare equal. */
function compact(value: string | undefined): string {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * True when a post is Counting Cubes content: the series, the persona (input
 * string, preset key, or preset name), or the video's uploading channel
 * (oEmbed author name/URL) mentions Counting Cubes. Deliberately broad — a
 * false positive only adds an approval step.
 */
export function isCountingCubes(post: Post, preset?: PresetRef, og?: OgSnapshot): boolean {
  const series = post.type === "video_upload" ? post.series : undefined;
  return [
    series,
    post.persona,
    preset?.key,
    preset?.preset.name,
    og?.author_name,
    og?.author_url,
  ].some((v) => compact(v).includes("countingcubes"));
}

function toUnix(iso: string): number {
  return Math.floor(Date.parse(iso) / 1000);
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function renderBody(post: Post, options: RenderOptions, preset?: PresetRef): RenderedPost {
  switch (post.type) {
    case "welcome":
    case "rules":
      return {
        embeds: [
          {
            title: post.title,
            description: post.body,
            ...(post.sections?.length
              ? { fields: post.sections.map((s) => ({ name: s.name, value: s.value })) }
              : {}),
          },
        ],
      };

    case "announcement":
      return {
        embeds: [
          {
            title: post.title,
            description: post.body,
            ...(post.link_url ? { url: post.link_url } : {}),
            ...(post.image_url ? { image: { url: post.image_url } } : {}),
          },
        ],
      };

    case "video_upload": {
      const og = options.og;
      if (!og) {
        throw new PostValidationError("video_upload needs the video's metadata to render");
      }
      if (og.error || isUnavailableTitle(og.title)) {
        throw new PostValidationError(
          `Refusing video_upload: the video looks unavailable (${
            og.error ?? (og.title?.trim() ? `title "${og.title.trim()}"` : "title missing")
          }). Check the video is public and the URL is right.`,
        );
      }
      if (isCountingCubes(post, preset, og) && post.confirm_public !== true) {
        throw new PostValidationError(
          "Refusing Counting Cubes video_upload without confirm_public: true. Counting Cubes videos must never be " +
            "pre-announced or posted while scheduled, premiere-pending, or unlisted — check the video is PUBLIC " +
            "and live first. This tool cannot detect unlisted videos.",
        );
      }
      const id = youtubeVideoId(post.url);
      const image = og.image && isPublicHttpsUrl(og.image) ? og.image : undefined;
      const description = og.description?.trim()
        ? truncate(decodeEntities(og.description.trim()), 300)
        : undefined;
      return {
        ...(post.note ? { content: post.note } : {}),
        embeds: [
          {
            title: truncate(decodeEntities(og.title!.trim()), 256),
            url: `https://www.youtube.com/watch?v=${id}`,
            ...(description ? { description } : {}),
            ...(image ? { image: { url: image } } : {}),
          },
        ],
      };
    }

    case "server_status": {
      const fields: NonNullable<Embed["fields"]> = [];
      if (post.address) fields.push({ name: "Address", value: post.address, inline: true });
      if (post.version) fields.push({ name: "Version", value: post.version, inline: true });
      if (post.players !== undefined) {
        fields.push({ name: "Players", value: String(post.players), inline: true });
      }
      return {
        embeds: [
          {
            title: STATUS_TITLES[post.state],
            color: STATUS_COLORS[post.state],
            ...(post.note ? { description: post.note } : {}),
            ...(fields.length ? { fields } : {}),
          },
        ],
      };
    }

    case "event": {
      const start = toUnix(post.starts_at);
      const fields: NonNullable<Embed["fields"]> = [
        { name: "Starts", value: `<t:${start}:F> (<t:${start}:R>)` },
      ];
      if (post.ends_at) fields.push({ name: "Ends", value: `<t:${toUnix(post.ends_at)}:F>` });
      if (post.location) fields.push({ name: "Where", value: post.location });
      return {
        embeds: [
          {
            title: post.title,
            description: post.description,
            fields,
            ...(post.image_url ? { image: { url: post.image_url } } : {}),
          },
        ],
      };
    }

    case "build_spotlight":
      return {
        embeds: [
          {
            title: post.title,
            ...(post.description ? { description: post.description } : {}),
            fields: [{ name: "Builder", value: post.builder, inline: true }],
            image: { url: post.image_url },
          },
        ],
      };

    case "character_line":
      return {
        content: post.line,
        embeds: post.image_url ? [{ image: { url: post.image_url } }] : [],
      };

    case "schedule_update": {
      const fields: NonNullable<Embed["fields"]> = [];
      if (post.starts_at) {
        const start = toUnix(post.starts_at);
        fields.push({ name: "When", value: `<t:${start}:F> (<t:${start}:R>)`, inline: true });
      }
      if (post.ends_at)
        fields.push({ name: "Until", value: `<t:${toUnix(post.ends_at)}:t>`, inline: true });
      const description = post.note ? `${post.change}\n\n${post.note}` : post.change;
      return {
        embeds: [
          {
            // The prefix must not push a 256-character title past Discord's limit.
            title: truncate(
              post.cancelled ? `\u274C Cancelled: ${post.title}` : `\u{1F552} ${post.title}`,
              256,
            ),
            description,
            color: post.cancelled ? SCHEDULE_COLORS.cancelled : SCHEDULE_COLORS.changed,
            ...(fields.length ? { fields } : {}),
          },
        ],
      };
    }

    case "custom": {
      const embeds = copyEmbeds(post.embeds as Embed[] | undefined);
      if (!post.content?.trim() && embeds.length === 0) {
        throw new PostValidationError("A custom post needs content, embeds, or both");
      }
      assertEmbedUrls(embeds);
      return { ...(post.content ? { content: post.content } : {}), embeds };
    }

    case "forum_post": {
      const embeds = copyEmbeds(post.embeds as Embed[] | undefined);
      assertEmbedUrls(embeds);
      return {
        content: post.content,
        embeds,
        thread: { name: post.title, tags: post.tags ?? [] },
      };
    }
  }
}

/** Discord's per-message limits: 2000 content chars, 10 embeds, 6000 embed chars total. */
function assertDiscordLimits(rendered: RenderedPost): void {
  if (rendered.content && rendered.content.length > 2000) {
    throw new PostValidationError("Rendered content exceeds Discord's 2000-character limit");
  }
  if (rendered.embeds.length > 10) {
    throw new PostValidationError("Rendered post exceeds Discord's 10-embed limit");
  }
  let total = 0;
  for (const embed of rendered.embeds) {
    total += (embed.title?.length ?? 0) + (embed.description?.length ?? 0);
    total += embed.footer?.text.length ?? 0;
    total += embed.author?.name.length ?? 0;
    for (const field of embed.fields ?? []) total += field.name.length + field.value.length;
  }
  if (total > 6000) {
    throw new PostValidationError(
      `Rendered embeds total ${total} characters — Discord caps a message's embeds at 6000`,
    );
  }
}

/**
 * Renders a post into a Discord message payload. Validates the post first
 * (so a stored ledger post is re-validated on publish), applies the type's
 * default color, then the preset's color/footer where still unset.
 * Throws PostValidationError with an agent-facing message on any refusal.
 */
export function renderPost(
  input: unknown,
  preset?: PresetRef,
  options: RenderOptions = {},
): RenderedPost {
  const post = parsePost(input);
  const body = renderBody(post, options, preset);
  const typeColor = TYPE_COLORS[post.type];
  const embeds = body.embeds.map((embed) => {
    // Preset color beats the type default; the state colors on server_status
    // and schedule_update
    // is already set and therefore kept.
    const withPreset = applyPresetEmbedDefaults(embed, preset?.preset);
    return withPreset.color === undefined && typeColor !== undefined
      ? { ...withPreset, color: typeColor }
      : withPreset;
  });
  const rendered: RenderedPost = {
    ...(body.content ? { content: body.content } : {}),
    embeds,
    ...(body.thread ? { thread: body.thread } : {}),
  };
  assertDiscordLimits(rendered);
  return rendered;
}

/** Recursively sorts object keys so equal payloads hash equally. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, canonicalize(v)]),
    );
  }
  return value;
}

/** SHA-256 over the canonical JSON of a payload. */
export function payloadSha256(payload: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(payload)))
    .digest("hex");
}
