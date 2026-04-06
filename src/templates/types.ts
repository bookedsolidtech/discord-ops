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

/**
 * Discord button component.
 * Link buttons open URLs. Non-link buttons require interaction handling.
 */
export interface TemplateButton {
  style: "primary" | "secondary" | "success" | "danger" | "link";
  label: string;
  url?: string; // Required for link buttons
  custom_id?: string; // Required for non-link buttons
  emoji?: string; // Unicode emoji or custom emoji name
  disabled?: boolean;
}

/**
 * Discord action row — holds up to 5 buttons.
 */
export interface TemplateActionRow {
  buttons: TemplateButton[];
}

/**
 * Discord native poll data.
 */
export interface TemplatePoll {
  question: string;
  answers: Array<{ text: string; emoji?: string }>;
  duration?: number; // Hours (1-768, default 24)
  allow_multiselect?: boolean;
}

export interface RenderedTemplate {
  content?: string;
  embeds: TemplateEmbed[];
  components?: TemplateActionRow[];
  poll?: TemplatePoll;
}

export type TemplateRenderer = (vars: Record<string, string>) => RenderedTemplate;

/**
 * Zod schema for template variables — all string key-value pairs.
 */
export const templateVarsSchema = z
  .record(z.string(), z.string())
  .describe("Template variables as key-value pairs (see template descriptions for required vars)");

// ─── Timestamp Helpers ─────────────────────────────────────────────

/**
 * Discord dynamic timestamp formatting.
 * Pass a Unix timestamp (seconds) to get a string that renders
 * in each user's local timezone and live-updates for relative.
 *
 * Styles:
 *   t = Short Time (9:01 AM)
 *   T = Long Time (9:01:00 AM)
 *   d = Short Date (11/28/2018)
 *   D = Long Date (November 28, 2018)
 *   f = Short Date/Time (November 28, 2018 9:01 AM)
 *   F = Long Date/Time (Wednesday, November 28, 2018 9:01 AM)
 *   R = Relative (3 hours ago / in 5 minutes — live-updating)
 */
export type TimestampStyle = "t" | "T" | "d" | "D" | "f" | "F" | "R";

export function discordTimestamp(unixSeconds: number, style: TimestampStyle = "f"): string {
  return `<t:${Math.floor(unixSeconds)}:${style}>`;
}

/**
 * Parse a date string or ISO timestamp to Discord timestamp format.
 * Returns the original string if parsing fails.
 */
export function toDiscordTimestamp(dateStr: string, style: TimestampStyle = "f"): string {
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return dateStr;
  return discordTimestamp(Math.floor(parsed / 1000), style);
}

/**
 * Create a relative countdown that live-updates.
 */
export function discordCountdown(dateStr: string): string {
  const parsed = Date.parse(dateStr);
  if (isNaN(parsed)) return dateStr;
  return discordTimestamp(Math.floor(parsed / 1000), "R");
}
