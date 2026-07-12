import { lookup } from "node:dns/promises";
import { isPublicHttpUrl } from "../../utils/og-fetch.js";
import { logger } from "../../utils/logger.js";

/** Max bytes for an application icon upload (Discord accepts up to ~2MB comfortably). */
export const MAX_ICON_BYTES = 2 * 1024 * 1024;

/** Max bytes for an application emoji image (Discord hard limit is 256KB). */
export const MAX_EMOJI_BYTES = 256 * 1024;

/** Image content types Discord accepts for icons and emojis. */
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

const FETCH_TIMEOUT_MS = 10_000;

export type ImageFetchResult =
  | { ok: true; dataUri: string; contentType: string; bytes: number }
  | { ok: false; error: string };

function formatLimit(maxBytes: number): string {
  return maxBytes >= 1024 * 1024 ? `${maxBytes / (1024 * 1024)}MB` : `${maxBytes / 1024}KB`;
}

/**
 * Fetches a remote image and converts it to a base64 data URI suitable for
 * discord.js image fields (application icon, application emoji attachment).
 *
 * SSRF hardening mirrors src/utils/og-fetch.ts and reuses its exported guard:
 *  1. `isPublicHttpUrl` string-level pre-check — protocol allowlist, localhost,
 *     private/reserved/link-local IP literals (incl. IPv6 and v4-mapped forms).
 *  2. DNS resolution of the hostname, then the *resolved* IP is re-checked
 *     through the same `isPublicHttpUrl` blocklist (anti DNS-rebinding).
 *  3. The request is pinned to the validated IP (Host header carries the
 *     original hostname) so a second resolution cannot be redirected.
 *  4. Redirects are refused outright — callers must supply the final URL.
 *
 * Content hardening: content-type must be an allowed image type, and the body
 * is streamed with a hard byte cap (declared content-length is also checked
 * up front so oversized downloads are refused before any bytes transfer).
 */
export async function fetchImageAsDataUri(
  url: string,
  maxBytes: number,
): Promise<ImageFetchResult> {
  // Step 1: string-level SSRF pre-check (same guard og-fetch uses).
  if (!isPublicHttpUrl(url)) {
    logger.warn("Blocked image fetch of non-public or non-HTTP URL", { url });
    return {
      ok: false,
      error:
        "URL must be a public http(s) URL — localhost, private, and reserved addresses are blocked",
    };
  }

  const parsed = new URL(url);
  const rawHost = parsed.hostname.toLowerCase();
  // Node's URL parser brackets IPv6 hostnames ("[::1]") — strip for DNS/Host use.
  const hostname =
    rawHost.startsWith("[") && rawHost.endsWith("]") ? rawHost.slice(1, -1) : rawHost;

  // Step 2: resolve DNS and re-validate the resolved address (anti-rebinding).
  // IP literals were already validated by the pre-check above.
  const isIpv4Literal = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const isIpv6Literal = hostname.includes(":");
  let address = hostname;
  if (!isIpv4Literal && !isIpv6Literal) {
    try {
      ({ address } = await lookup(hostname));
    } catch (err) {
      logger.warn("Blocked image fetch: DNS lookup failed", {
        hostname,
        error: err instanceof Error ? err.message : String(err),
      });
      return { ok: false, error: `DNS lookup failed for "${hostname}"` };
    }
    // Re-run the exact same blocklist against the resolved IP by probing it
    // through the exported guard — no duplicated blocklist logic.
    const probe = address.includes(":") ? `http://[${address}]/` : `http://${address}/`;
    if (!isPublicHttpUrl(probe)) {
      logger.warn("Blocked image fetch: DNS resolved to a private/reserved IP", {
        hostname,
        resolvedIp: address,
      });
      return {
        ok: false,
        error: "URL resolved to a private or reserved IP (possible DNS rebinding) — refused",
      };
    }
  }

  // Step 3: pin the request to the validated IP; original hostname rides in
  // the Host header so virtual hosting still works (same pattern as og-fetch).
  const pinnedUrl = new URL(url);
  pinnedUrl.hostname = address.includes(":") ? `[${address}]` : address;

  let response: Response;
  try {
    response = await fetch(pinnedUrl.toString(), {
      headers: {
        "User-Agent": "discord-ops/1.0 (image fetcher)",
        Host: hostname,
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: "manual",
    });
  } catch (err) {
    return {
      ok: false,
      error: `Image fetch failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Step 4: refuse redirects — following them would bypass the IP validation.
  if (response.status >= 300 && response.status < 400) {
    logger.warn("Blocked redirect from image fetch URL", { url });
    return { ok: false, error: "Redirects are not followed — provide the final image URL" };
  }

  if (!response.ok) {
    return { ok: false, error: `Image fetch returned HTTP ${response.status}` };
  }

  const contentType = (response.headers.get("content-type") ?? "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
    return {
      ok: false,
      error: `Unsupported content-type "${contentType || "unknown"}" — expected one of: ${[...ALLOWED_IMAGE_TYPES].join(", ")}`,
    };
  }

  // Refuse oversized bodies before reading when the server declares a length.
  const declaredLength = response.headers.get("content-length");
  if (declaredLength && Number(declaredLength) > maxBytes) {
    return {
      ok: false,
      error: `Image is ${declaredLength} bytes — exceeds the ${formatLimit(maxBytes)} limit`,
    };
  }

  if (!response.body) {
    return { ok: false, error: "Image response had no body" };
  }

  // Stream with a hard cap — never trust the declared content-length alone.
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return {
          ok: false,
          error: `Image exceeds the ${formatLimit(maxBytes)} limit`,
        };
      }
      chunks.push(value);
    }
  }

  if (total === 0) {
    return { ok: false, error: "Image response was empty" };
  }

  const buffer = Buffer.concat(chunks);
  return {
    ok: true,
    dataUri: `data:${contentType};base64,${buffer.toString("base64")}`,
    contentType,
    bytes: total,
  };
}
