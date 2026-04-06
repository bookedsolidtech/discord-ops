import { lookup } from "node:dns/promises";
import { logger } from "./logger.js";

export interface OgMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

/**
 * Returns true if the given IPv4 or IPv6 string represents a non-public,
 * private, or reserved address that should be blocked for SSRF prevention.
 * This is called both on the raw URL hostname (when it is an IP literal) and
 * on the post-DNS-resolution address to defend against DNS rebinding.
 */
function isBlockedIp(ip: string): boolean {
  const h = ip.toLowerCase();

  // IPv6 loopback / unspecified
  if (h === "::1" || h === "::") return true;

  // IPv4: unspecified and full loopback range (127.0.0.0/8)
  if (h === "0.0.0.0" || /^127\./.test(h)) return true;

  // Link-local — AWS/Azure/GCP IMDS and other APIPA (169.254.0.0/16)
  if (h.startsWith("169.254.")) return true;

  // RFC-1918 private IPv4
  if (h.startsWith("10.")) return true;
  if (h.startsWith("192.168.")) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;

  // Shared address space 100.64.0.0/10 (carrier-grade NAT, Tailscale, cloud)
  if (h.startsWith("100.")) {
    const second = parseInt(h.split(".")[1] ?? "-1", 10);
    if (second >= 64 && second <= 127) return true;
  }

  // Benchmarking range 198.18.0.0/15
  if (h.startsWith("198.")) {
    const second = parseInt(h.split(".")[1] ?? "-1", 10);
    if (second >= 18 && second <= 19) return true;
  }

  // IPv6 private / link-local (fc00::/7 = fc** and fd**, fe80::/10)
  if (h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80")) return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x).
  // The URL parser may normalize to hex form (e.g. ::ffff:a9fe:a9fe for 169.254.169.254).
  // Decode both dotted-decimal and two-group hex forms, then re-apply IPv4 checks.
  if (h.startsWith("::ffff:")) {
    const mapped = h.slice(7);
    let ipv4Part: string;
    if (mapped.includes(":")) {
      // Hex-normalized form: two 16-bit groups, e.g. "a9fe:a9fe"
      const parts = mapped.split(":");
      if (parts.length !== 2) return true; // fail-safe: reject malformed
      const hi = parseInt(parts[0], 16);
      const lo = parseInt(parts[1], 16);
      ipv4Part = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
    } else {
      ipv4Part = mapped; // Dotted-decimal form, e.g. "169.254.169.254"
    }
    return isBlockedIp(ipv4Part);
  }

  return false;
}

/**
 * Fast synchronous pre-check: validates protocol and rejects obvious blocked
 * hostnames / IP literals before we ever hit the network.
 *
 * Returns `{ valid: false }` when the URL should be rejected immediately.
 * Returns `{ valid: true, hostname }` with the stripped hostname when the URL
 * passes the string-level check and still needs DNS validation.
 */
function preValidateUrl(urlStr: string): { valid: false } | { valid: true; hostname: string } {
  try {
    const url = new URL(urlStr);
    if (!["http:", "https:"].includes(url.protocol)) return { valid: false };

    // Node.js URL parser includes brackets for IPv6 hostnames (e.g. "[::1]").
    // Strip them before applying checks so string comparisons work uniformly.
    const raw = url.hostname.toLowerCase();
    const h = raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw;

    // Reject "localhost" by name and any blocked IP literal
    if (h === "localhost") return { valid: false };
    if (isBlockedIp(h)) return { valid: false };

    return { valid: true, hostname: h };
  } catch {
    return { valid: false };
  }
}

/**
 * Resolves the given hostname via the system DNS resolver and validates that
 * the resolved IP is not a private/reserved address.
 *
 * This is the core DNS-rebinding defence: even if the string-level pre-check
 * passed, a rebinding attack could have the hostname resolve to a private IP
 * after the check. By resolving before fetching and re-running the blocklist
 * check against the actual IP, we close that TOCTOU window.
 *
 * If the hostname is already an IP literal (v4 or v6) it was already validated
 * by `preValidateUrl`; we skip DNS in that case.
 *
 * Returns `true` if safe to proceed, `false` if the resolved IP is blocked
 * or the lookup fails.
 */
async function resolveAndValidateHostname(hostname: string): Promise<boolean> {
  // Already an IP literal — pre-validated by preValidateUrl, skip DNS.
  const isIpv4Literal = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
  const isIpv6Literal = hostname.includes(":");
  if (isIpv4Literal || isIpv6Literal) {
    return true;
  }

  try {
    const { address } = await lookup(hostname);
    if (isBlockedIp(address)) {
      logger.warn("Blocked OG fetch: DNS resolved to a private/reserved IP (possible rebinding)", {
        hostname,
        resolvedIp: address,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn("Blocked OG fetch: DNS lookup failed", {
      hostname,
      error: err instanceof Error ? err.message : String(err),
    });
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
  // Step 1: synchronous pre-check — protocol, obvious IP literals, "localhost"
  const preCheck = preValidateUrl(url);
  if (!preCheck.valid) {
    logger.warn("Blocked fetch of non-public or non-HTTP URL", { url });
    return {};
  }

  // Step 2: DNS resolution + post-resolution IP blocklist check (anti-rebinding)
  const dnsOk = await resolveAndValidateHostname(preCheck.hostname);
  if (!dnsOk) {
    // Warning already emitted inside resolveAndValidateHostname
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
