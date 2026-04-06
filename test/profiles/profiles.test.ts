import { describe, it, expect } from "vitest";
import { PROFILES, filterTools } from "../../src/tools/profiles.js";
import { allTools } from "../../src/tools/index.js";

describe("filterTools", () => {
  it("returns all tools when profile is 'all'", () => {
    const result = filterTools(allTools, "all");
    expect(result).toHaveLength(allTools.length);
  });

  it("returns all tools when profile name is not found", () => {
    const result = filterTools(allTools, "nonexistent-profile");
    expect(result).toHaveLength(allTools.length);
  });

  it("returns only the tools named in a specific profile", () => {
    const result = filterTools(allTools, "messaging");
    const profile = PROFILES["messaging"];
    expect(Array.isArray(profile)).toBe(true);
    const expected = new Set(profile as readonly string[]);
    for (const tool of result) {
      expect(expected.has(tool.name)).toBe(true);
    }
    expect(result).toHaveLength((profile as readonly string[]).length);
  });

  it("returns a new array and does not mutate the input", () => {
    const original = [...allTools];
    filterTools(allTools, "readonly");
    expect(allTools).toHaveLength(original.length);
  });

  it("all profile tool names exist in the real allTools registry", () => {
    const realNames = new Set(allTools.map((t) => t.name));
    for (const [profileName, profileTools] of Object.entries(PROFILES)) {
      if (profileTools === "all") continue;
      for (const toolName of profileTools) {
        expect(
          realNames.has(toolName),
          `Profile "${profileName}" references unknown tool "${toolName}"`,
        ).toBe(true);
      }
    }
  });
});
