import { logger } from "./logger.js";

export interface OgMetadata {
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
}

export async function fetchOgMetadata(url: string): Promise<OgMetadata> {
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

    const properties = ["title", "description", "image", "site_name"] as const;
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

    void properties; // suppress unused warning

    return result;
  } catch (err) {
    logger.warn("Failed to fetch OG metadata", {
      url,
      error: err instanceof Error ? err.message : String(err),
    });
    return {};
  }
}
