import { z } from "zod";

/**
 * Shared Zod schemas for Discord tool inputs.
 */

/** Discord snowflake ID — 17-20 digit numeric string */
export const snowflakeId = z.string().regex(/^\d{17,20}$/, "Must be a valid Discord snowflake ID");

/** Audit log / moderation reason — max 512 chars per Discord API */
export const reason = z
  .string()
  .max(512)
  .optional()
  .describe("Reason (logged in audit log, max 512 chars)");
