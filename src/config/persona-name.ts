import { z } from "zod";

/**
 * Reserved persona names that must not be impersonable. A persona is a
 * per-message display name with no authentication behind it, so a name that
 * reads as an authority (an operator, a moderator, or Discord itself) is a
 * social-engineering vector against humans skim-reading the channel. This is
 * defense-in-depth, not authentication — the tool descriptions and docs state
 * plainly that a display name is never an authorization signal.
 */
const RESERVED_PERSONA_NAMES = new Set([
  "system",
  "admin",
  "administrator",
  "moderator",
  "mod",
  "discord",
  "clyde",
  "everyone",
  "here",
  "owner",
  "root",
]);

/**
 * Zero-width and bidirectional control characters (U+200B–U+200F, U+202A–
 * U+202E, U+2060, U+FEFF). Built via RegExp from escapes (rather than a
 * literal) so the source stays free of irregular whitespace. Used to defeat
 * obfuscated authority names like a "System" with a zero-width space inside.
 */
const INVISIBLE_CHARS = new RegExp("[\\u200B-\\u200F\\u202A-\\u202E\\u2060\\uFEFF]", "g");

/**
 * Normalize a name for reserved-word comparison: strip invisible characters,
 * collapse whitespace, and lowercase, so a zero-width-obfuscated "System" or a
 * padded " Admin " cannot slip past the blocklist.
 */
function normalizeForBlocklist(name: string): string {
  return name.replace(INVISIBLE_CHARS, "").trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Persona display name — used as the per-message webhook username override.
 * Discord rejects webhook usernames containing "clyde" or "discord"
 * (case-insensitive) and caps them at 80 characters; on top of that we block
 * reserved authority names to blunt impersonation.
 */
export const personaName = z
  .string()
  .min(1)
  .max(80)
  .refine((name) => !/clyde|discord/i.test(name), {
    message: 'Discord rejects webhook usernames containing "clyde" or "discord"',
  })
  .refine((name) => !RESERVED_PERSONA_NAMES.has(normalizeForBlocklist(name)), {
    message:
      "Reserved persona name — names that read as an authority (system, admin, moderator, owner, etc.) are blocked to prevent impersonation. A persona name is not an authorization signal.",
  });
