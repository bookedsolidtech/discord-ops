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
    // Node.js URL parser includes brackets for IPv6 hostnames (e.g. "[::1]").
    // Strip them before applying checks so string comparisons work uniformly.
    const raw = url.hostname.toLowerCase();
    const h = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;
    // Loopback — full 127.0.0.0/8 range + IPv6 loopback
    if (h === "localhost" || h === "::1") return false;
    if (h === "127.0.0.1" || /^127\./.test(h)) return false;
    // Link-local — AWS/Azure/GCP metadata endpoints
    if (h === "169.254.169.254" || h.startsWith("169.254.")) return false;
    // RFC-1918 private IPv4
    if (h.startsWith("10.") || h.startsWith("192.168.")) return false;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
    // IPv6 private/link-local (fc00::/7, fe80::/10)
    if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return false;
    // IPv4-mapped IPv6 (::ffff:x.x.x.x).
    // The URL parser may normalize to hex form (e.g. ::ffff:a9fe:a9fe for 169.254.169.254).
    // Decode both dotted-decimal and two-group hex forms, then re-apply IPv4 checks.
    if (h.startsWith("::ffff:")) {
      const mapped = h.slice(7);
      let ipv4Part: string;
      if (mapped.includes(":")) {
        // Hex-normalized form: two 16-bit groups, e.g. "a9fe:a9fe"
        const parts = mapped.split(":");
        if (parts.length !== 2) return false;
        const hi = parseInt(parts[0], 16);
        const lo = parseInt(parts[1], 16);
        ipv4Part = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
      } else {
        ipv4Part = mapped; // Dotted-decimal form
      }
      if (ipv4Part === "127.0.0.1" || /^127\./.test(ipv4Part)) return false;
      if (ipv4Part.startsWith("10.") || ipv4Part.startsWith("192.168.")) return false;
      if (/^172\.(1[6-9]|2\d|3[01])\./.test(ipv4Part)) return false;
      if (ipv4Part.startsWith("169.254.")) return false;
    }
    return true;
  } catch {
    return false;
  }
}

// Pre-compiled OG meta patterns — built once at module load
const OG_PATTERNS: Array<{ key: keyof OgMetadata; fwd: RegExp; rev: RegExp }> = (
  [
    ["og:title", "title"],
    ["og:description", "description"],
    ["og:image", "image"],
    ["og:site_name", "siteName"],
  ] as const
).map(([prop, key]) => ({
  key,
  fwd: new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"),
  rev: new RegExp(`content=["']([^"']+)["'][^>]*property=["']${prop}["']`, "i"),
}));

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
  if (!isPublicHttpUrl(url)) {
    logger.warn("Blocked fetch of non-public or non-HTTP URL", { url });
    return {};
  }

  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "discord-ops/1.0 (OG metadata fetcher)" },
      signal: AbortSignal.timeout(5000),
      redirect: "manual",
    });

    if (response.status >= 300 && response.status < 400) {
      logger.warn("Blocked redirect from OG fetch URL", { url });
      return {};
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return {};
    }

    const text = (await response.text()).slice(0, 50000);
    const result: OgMetadata = {};

    for (const { key, fwd, rev } of OG_PATTERNS) {
      const value = text.match(fwd)?.[1] ?? text.match(rev)?.[1];
      if (value) result[key] = value;
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
