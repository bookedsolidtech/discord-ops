import { logger } from "../utils/logger.js";
import type { OgSnapshot } from "./render.js";

/**
 * Video metadata for video_upload posts, from YouTube's oEmbed endpoint.
 *
 * Why not og-fetch: a YouTube watch page is ~1.4 MB and its og:title sits
 * past the first 800 KB, beyond og-fetch's 50 KB read window, and og-fetch's
 * IP-pinned HTTPS request fails certificate validation for YouTube. oEmbed is
 * small JSON, reports private (401/403) and deleted (404) videos directly,
 * and also names the uploading channel.
 *
 * SSRF: the request host is a constant (www.youtube.com) and the only
 * caller-derived part is an 11-character video id that the schema already
 * validated, so no caller-controlled host is ever fetched. Redirects are refused.
 *
 * Limitation: oEmbed answers 200 for UNLISTED videos and for scheduled
 * premieres, so neither can be detected here.
 */

const OEMBED_TIMEOUT_MS = 5000;
const MAX_BODY_CHARS = 64 * 1024;

function str(value: unknown, max: number): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : undefined;
}

export async function fetchYoutubeVideoInfo(videoId: string): Promise<OgSnapshot> {
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return { error: "invalid video id" };
  const watchUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const endpoint = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`;

  let response: Response;
  try {
    response = await fetch(endpoint, {
      headers: { Accept: "application/json", "User-Agent": "discord-ops/1.0 (video check)" },
      redirect: "manual",
      signal: AbortSignal.timeout(OEMBED_TIMEOUT_MS),
    });
  } catch (err) {
    logger.warn("YouTube oEmbed lookup failed", {
      videoId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { error: "could not reach YouTube to verify the video" };
  }

  if (response.status === 401 || response.status === 403) {
    return { error: "YouTube reports the video as private or not embeddable" };
  }
  if (response.status === 404 || response.status === 400) {
    return { error: "YouTube reports the video does not exist" };
  }
  if (response.status !== 200) {
    return { error: `YouTube answered HTTP ${response.status}` };
  }

  let data: Record<string, unknown>;
  try {
    data = JSON.parse((await response.text()).slice(0, MAX_BODY_CHARS)) as Record<string, unknown>;
  } catch {
    return { error: "YouTube returned an unreadable response" };
  }

  const info: OgSnapshot = {};
  const title = str(data.title, 512);
  const image = str(data.thumbnail_url, 2048);
  const authorName = str(data.author_name, 256);
  const authorUrl = str(data.author_url, 2048);
  if (title) info.title = title;
  if (image) info.image = image;
  if (authorName) info.author_name = authorName;
  if (authorUrl) info.author_url = authorUrl;
  return info;
}
