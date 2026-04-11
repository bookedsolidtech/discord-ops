import { describe, it, expect } from "vitest";
import { fuzzyFind, type Named } from "../../src/routing/fuzzy.js";

const channels: Named[] = [
  { id: "111", name: "general" },
  { id: "222", name: "website-builds" },
  { id: "333", name: "dev-chat" },
  { id: "444", name: "release-notes" },
  { id: "555", name: "general-updates" },
];

describe("fuzzyFind", () => {
  it("matches exact ID", () => {
    const result = fuzzyFind(channels, "222");
    expect(result?.item.name).toBe("website-builds");
    expect(result?.matchType).toBe("exact_id");
  });

  it("matches exact name (case-insensitive)", () => {
    const result = fuzzyFind(channels, "General");
    expect(result?.item.id).toBe("111");
    expect(result?.matchType).toBe("exact_name");
  });

  it("matches normalized name (stripped separators)", () => {
    const result = fuzzyFind(channels, "websitebuilds");
    expect(result?.item.id).toBe("222");
    expect(result?.matchType).toBe("normalized");
  });

  it("matches substring", () => {
    const result = fuzzyFind(channels, "releasenote");
    expect(result?.item.id).toBe("444");
    expect(result?.matchType).toBe("substring");
  });

  it("returns undefined for no match", () => {
    const result = fuzzyFind(channels, "nonexistent-very-long-name");
    expect(result).toBeUndefined();
  });
});
