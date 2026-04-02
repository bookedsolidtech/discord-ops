import { describe, it, expect } from "vitest";
import { DISCORD_EPOCH, timestampToSnowflake, isTimestamp } from "../../src/utils/snowflake.js";

describe("isTimestamp", () => {
  it("returns true for ISO 8601 strings", () => {
    expect(isTimestamp("2025-01-01T00:00:00Z")).toBe(true);
    expect(isTimestamp("2025-01-01")).toBe(true);
    expect(isTimestamp("2025-06-15T12:30:00.000Z")).toBe(true);
  });

  it("returns false for all-digit snowflakes", () => {
    expect(isTimestamp("123456789012345678")).toBe(false);
    expect(isTimestamp("00000000000000000")).toBe(false);
  });
});

describe("timestampToSnowflake", () => {
  it("converts the Discord epoch to snowflake 0", () => {
    // 2015-01-01T00:00:00.000Z is the Discord epoch
    const snowflake = timestampToSnowflake("2015-01-01T00:00:00.000Z");
    expect(snowflake).toBe("0");
  });

  it("converts a known timestamp correctly", () => {
    // 2025-01-01T00:00:00.000Z
    const ms = Date.parse("2025-01-01T00:00:00.000Z");
    const expectedDiscordMs = BigInt(ms) - DISCORD_EPOCH;
    const expectedSnowflake = (expectedDiscordMs << 22n).toString();
    expect(timestampToSnowflake("2025-01-01T00:00:00.000Z")).toBe(expectedSnowflake);
  });

  it("produces a snowflake that is a valid numeric string", () => {
    const snowflake = timestampToSnowflake("2025-06-15T12:00:00Z");
    expect(/^\d+$/.test(snowflake)).toBe(true);
  });

  it("throws on invalid timestamp", () => {
    expect(() => timestampToSnowflake("not-a-date")).toThrow("Invalid ISO 8601 timestamp");
  });

  it("throws on timestamps before Discord epoch", () => {
    expect(() => timestampToSnowflake("2010-01-01T00:00:00Z")).toThrow("before the Discord epoch");
  });
});
