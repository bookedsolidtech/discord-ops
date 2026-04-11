import { describe, it, expect } from "vitest";
import { filterTools, isProfileName, PROFILE_NAMES } from "../../src/profiles/index.js";
import type { ToolDefinition } from "../../src/tools/types.js";

// Minimal stub tool list for testing
function makeTools(names: string[]): ToolDefinition[] {
  return names.map(
    (name) =>
      ({
        name,
        description: `${name} tool`,
        category: "messaging",
        inputSchema: {} as any,
        handle: async () => ({ content: [], isError: false }),
      }) as unknown as ToolDefinition,
  );
}

const TOOL_NAMES = ["send_message", "get_messages", "health_check", "list_channels", "kick_member"];
const tools = makeTools(TOOL_NAMES);

describe("isProfileName", () => {
  it("returns true for valid profile names", () => {
    for (const name of PROFILE_NAMES) {
      expect(isProfileName(name)).toBe(true);
    }
  });

  it("returns false for unknown strings", () => {
    expect(isProfileName("bogus")).toBe(false);
    expect(isProfileName("all")).toBe(false);
    expect(isProfileName("")).toBe(false);
  });
});

describe("filterTools", () => {
  it("returns all tools when no options provided", () => {
    const result = filterTools(tools);
    expect(result).toHaveLength(tools.length);
    expect(result).toEqual(tools);
  });

  it("returns all tools when empty options provided", () => {
    const result = filterTools(tools, {});
    expect(result).toHaveLength(tools.length);
  });

  it("filters by explicit tools list", () => {
    const result = filterTools(tools, { tools: ["send_message", "health_check"] });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toEqual(
      expect.arrayContaining(["send_message", "health_check"]),
    );
  });

  it("throws on unknown tool name in tools list", () => {
    expect(() => filterTools(tools, { tools: ["NONEXISTENT"] })).toThrow(
      "Unknown tool names: NONEXISTENT",
    );
  });

  it("filters by profile name (non-full)", () => {
    // Use real allTools so profile tool names are valid
    const allNames = [
      "send_message",
      "get_messages",
      "health_check",
      "list_channels",
      "list_members",
      "get_guild",
      "list_projects",
      "list_bots",
    ];
    const allTools = makeTools(allNames);

    const result = filterTools(allTools, { profile: "readonly" });
    // readonly profile: get_messages, list_channels, list_members, get_guild, health_check, list_projects, list_bots
    expect(result.length).toBeGreaterThan(0);
    for (const t of result) {
      expect(allNames).toContain(t.name);
    }
  });

  it("throws on unknown profile", () => {
    expect(() => filterTools(tools, { profile: "unknown_profile" })).toThrow(
      /Unknown profile "unknown_profile"/,
    );
  });

  it("throws when add references unknown tool", () => {
    expect(() => filterTools(tools, { add: ["NONEXISTENT_TOOL"], profile: "monitoring" })).toThrow(
      /tool_profile_add references unknown tools/,
    );
  });

  it("throws when remove references unknown tool", () => {
    expect(() =>
      filterTools(tools, { remove: ["NONEXISTENT_TOOL"], profile: "monitoring" }),
    ).toThrow(/tool_profile_remove references unknown tools/);
  });

  it("full profile returns all tools", () => {
    const result = filterTools(tools, { profile: "full" });
    expect(result).toHaveLength(tools.length);
  });

  it("add/remove modifies profile set", () => {
    const allNames = [
      "send_message",
      "get_messages",
      "health_check",
      "list_channels",
      "list_members",
      "get_guild",
      "list_projects",
      "list_bots",
      "add_reaction",
      "create_thread",
      "kick_member",
      "ban_member",
      "timeout_member",
      "delete_message",
      "purge_messages",
      "query_audit_log",
    ];
    const allTools = makeTools(allNames);

    // Start with readonly, add kick_member, remove health_check
    const result = filterTools(allTools, {
      profile: "readonly",
      add: ["kick_member"],
      remove: ["health_check"],
    });

    const resultNames = result.map((t) => t.name);
    expect(resultNames).toContain("kick_member");
    expect(resultNames).not.toContain("health_check");
  });
});
