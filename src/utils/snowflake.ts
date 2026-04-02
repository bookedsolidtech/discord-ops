/**
 * Discord snowflake ↔ ISO 8601 timestamp conversion utilities.
 */

/** Discord epoch: 2015-01-01T00:00:00.000Z */
export const DISCORD_EPOCH = 1420070400000n;

/**
 * Convert an ISO 8601 timestamp to a Discord snowflake ID.
 * The snowflake encodes the timestamp in its upper bits (worker/process/increment = 0).
 */
export function timestampToSnowflake(iso: string): string {
  const ms = Date.parse(iso);
  if (isNaN(ms)) {
    throw new Error(`Invalid ISO 8601 timestamp: ${iso}`);
  }
  const discordMs = BigInt(ms) - DISCORD_EPOCH;
  if (discordMs < 0n) {
    throw new Error(`Timestamp ${iso} is before the Discord epoch (2015-01-01)`);
  }
  // Snowflake = (ms since Discord epoch) << 22
  return (discordMs << 22n).toString();
}

/**
 * Detect whether a string looks like an ISO 8601 timestamp vs. an all-digit snowflake.
 * Returns true if the value contains `-` or `T` (timestamp indicators).
 */
export function isTimestamp(value: string): boolean {
  return value.includes("-") || value.includes("T");
}
