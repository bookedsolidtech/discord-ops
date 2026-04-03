import { logger } from "./logger.js";

export interface OgMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

/**
 * Validates that a URL is a public HTTP/HTTPS URL.
 * Blocks loopback, link-local, and private RFC-1918 ranges to prevent SSRF (M-2).
 */
function isPublicHttpUrl(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    if (!["http:", "https:"].includes(url.protocol)) return false;
    const h = url.hostname.toLowerCase();
    // Loopback
    if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
    // Link-local — AWS/Azure/GCP metadata endpoints
    if (h === "169.254.169.254" || h.startsWith("169.254.")) return false;
    // RFC-1918 private IPv4
    if (h.startsWith("10.") || h.startsWith("192.168.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    // IPv6 private/link-local (fc00::/7, fe80::/10)
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return false;
    return true;
  } catch {
    return false;
  }
}

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  if (!isPublicHttpUrl(url)) {
    logger.warn("Blocked fetch of non-public or non-HTTP URL", { url });
    return {};
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "discord-ops/1.0 (OG metadata fetcher)" },
      signal: AbortSignal.timeout(5000),
    });

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {};
    }

    const text = (await response.text()).slice(0, 50000);
    const result: OgMetadata = {};

    const ogKeys: Record<string, keyof OgMetadata> = {
      "og:title": "title",
      "og:description": "description",
      "og:image": "image",
      "og:site_name": "siteName",
    };

    for (const [prop, key] of Object.entries(ogKeys)) {
      // property="og:X" content="Y"
      const fwdMatch = text.match(
        new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"),
      );
      // content="Y" property="og:X"
      const revMatch = text.match(
        new RegExp(`content=["']([^"']+)["'][^>]*property=["']${prop}["']`, "i"),
      );
      const value = fwdMatch?.[1] ?? revMatch?.[1];
      if (value) {
        result[key] = value;
      }
    }

    return result;
  } catch (err) {
    logger.warn("Failed to fetch OG metadata", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
