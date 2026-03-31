import { z } from "zod";

/**
 * Discord embed color palette — curated for visual impact.
 */
export const Colors = {
  // Status
  success: 0x57f287, // Green
  error: 0xed4245, // Red
  warning: 0xfee75c, // Yellow
  info: 0x5865f2, // Blurple

  // Vibes
  celebration: 0xf47fff, // Pink/magenta
  premium: 0xf0b132, // Gold
  calm: 0x2f3136, // Dark embed
  ocean: 0x3498db, // Blue
  mint: 0x1abc9c, // Teal
  sunset: 0xe67e22, // Orange
  lavender: 0x9b59b6, // Purple
  ember: 0xe74c3c, // Deep red
  frost: 0x99aab5, // Silver/gray
} as const;

export interface TemplateEmbed {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  thumbnail?: { url: string };
  image?: { url: string };
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
  author?: { name: string; icon_url?: string; url?: string };
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}

export interface RenderedTemplate {
  content?: string;
  embeds: TemplateEmbed[];
}

export type TemplateRenderer = (vars: Record<string, string>) => RenderedTemplate;

/**
 * Zod schema for template variables — all string key-value pairs.
 */
export const templateVarsSchema = z
  .record(z.string(), z.string())
  .describe("Template variables as key-value pairs (see template descriptions for required vars)");
