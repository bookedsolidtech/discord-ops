import { describe, it, expect } from "vitest";
import { z } from "zod";
import { allTools } from "../../src/tools/index.js";

/**
 * Snowflake ID fields must be typed as `z.string()` with a regex pattern,
 * not bare `z.string()` or `z.number()`. This prevents 64-bit integer
 * precision loss when callers pass IDs as JSON numbers.
 *
 * See: https://github.com/bookedsolidtech/discord-ops/issues/73
 */

/** Parameter names that represent Discord snowflake IDs */
const SNOWFLAKE_PARAMS = new Set([
  "channel_id",
  "guild_id",
  "message_id",
  "user_id",
  "role_id",
  "webhook_id",
  "thread_id",
  "target_id",
  "parent_id",
  "author_id",
  "before_id",
  "after_id",
]);

/**
 * The `before` and `after` params in get_messages use a snowflake-or-timestamp
 * transform, which is string-based and safe against numeric coercion.
 * Transforms may throw on invalid strings rather than returning safeParse
 * failures, so we only test the critical numeric-rejection invariant for these.
 */
const SNOWFLAKE_OR_TIMESTAMP_PARAMS = new Set(["before", "after"]);

/** Valid snowflake for testing -- 18-digit string */
const VALID_SNOWFLAKE = "123456789012345678";

/** Invalid values that must be rejected by pure snowflake schemas */
const INVALID_VALUES = [
  { label: "short numeric string", value: "12345" },
  { label: "non-numeric string", value: "not-a-snowflake" },
  { label: "empty string", value: "" },
];

/**
 * Helper: parse a value against a Zod schema, returning false if safeParse
 * returns failure OR if a transform throws (both indicate rejection).
 */
function rejects(schema: z.ZodType, value: unknown): boolean {
  try {
    const result = schema.safeParse(value);
    return !result.success;
  } catch {
    // Transforms that throw new Error() instead of using ctx.addIssue()
    // still constitute a rejection of the input value.
    return true;
  }
}

describe("snowflake ID schema enforcement", () => {
  for (const tool of allTools) {
    const schema = tool.inputSchema;

    // Only ZodObject schemas have .shape
    if (!(schema instanceof z.ZodObject)) continue;

    const shape = (schema as z.ZodObject<any>).shape;

    for (const [key, fieldSchema] of Object.entries(shape)) {
      const isSnowflake = SNOWFLAKE_PARAMS.has(key);
      const isSnowflakeOrTimestamp = SNOWFLAKE_OR_TIMESTAMP_PARAMS.has(key);
      if (!isSnowflake && !isSnowflakeOrTimestamp) continue;

      describe(`${tool.name}.${key}`, () => {
        // Unwrap optional wrapper if present
        const inner =
          fieldSchema instanceof z.ZodOptional
            ? (fieldSchema as z.ZodOptional<any>).unwrap()
            : (fieldSchema as z.ZodType);

        it("accepts a valid snowflake string", () => {
          const result = (inner as z.ZodType).safeParse(VALID_SNOWFLAKE);
          expect(result.success).toBe(true);
        });

        it("rejects a numeric (non-string) value", () => {
          expect(rejects(inner as z.ZodType, 123456789012345678)).toBe(true);
        });

        // Only run detailed invalid-string tests on pure snowflake schemas.
        // Transform-based schemas (before/after) may throw on invalid strings
        // rather than returning a clean safeParse failure.
        if (isSnowflake) {
          for (const { label, value } of INVALID_VALUES) {
            it(`rejects ${label}: "${value}"`, () => {
              const result = (inner as z.ZodType).safeParse(value);
              expect(result.success).toBe(false);
            });
          }
        }
      });
    }
  }
});
