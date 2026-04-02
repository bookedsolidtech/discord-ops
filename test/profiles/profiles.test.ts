import { describe, it, expect } from "vitest";
import {
  filterTools,
  isProfileName,
  PROFILES,
  PROFILE_NAMES,
} from "../../src/profiles/index.js";
import type { ToolDefinition } from "../../src/tools/types.js";

// Minimal fake tools for testing
function fakeTool(name: string): ToolDefinition {
  return {
    name,
    description: `${name} tool`,
    category: "test",
    inputSchema: {} as any,
    handle: async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
  };
}

const ALL_TOOL_NAMES = [
  "get_messages",
  "send_message",
  "add_reaction",
  "create_thread",
  "health_check",
  "list_projects",
  "list_channels",
  "list_members",
  "get_guild",
  "kick_member",
  "ban_member",
  "timeout_member",
  "delete_message",
  "purge_messages",
  "query_audit_log",
  "extra_tool",
];
const allTools = ALL_TOOL_NAMES.map(fakeTool);

describe("isProfileName", () => {
  it("accepts valid profile names", () => {
    for (const name of PROFILE_NAMES) {
      expect(isProfileName(name)).toBe(true);
    }
  });

  it("rejects invalid names", () => {
    expect(isProfileName("bogus")).toBe(false);
    expect(isProfileName("")).toBe(false);
  });
});

describe("filterTools", () => {
  it("returns all tools with no options", () => {
    expect(filterTools(allTools)).toHaveLength(allTools.length);
    expect(filterTools(allTools, {})).toHaveLength(allTools.length);
  });

  it("filters by full profile (returns all)", () => {
    const result = filterTools(allTools, { profile: "full" });
    expect(result).toHaveLength(allTools.length);
  });

  it("filters by monitoring profile", () => {
    const result = filterTools(allTools, { profile: "monitoring" });
    const names = result.map((t) => t.name);
    expect(new Set(names)).toEqual(new Set(PROFILES.monitoring as string[]));
    expect(result).toHaveLength(6);
  });

  it("filters by readonly profile", () => {
    const result = filterTools(allTools, { profile: "readonly" });
    const names = result.map((t) => t.name);
    expect(new Set(names)).toEqual(new Set(PROFILES.readonly as string[]));
    expect(result).toHaveLength(6);
  });

  it("filters by moderation profile", () => {
    const result = filterTools(allTools, { profile: "moderation" });
    const names = result.map((t) => t.name);
    expect(new Set(names)).toEqual(new Set(PROFILES.moderation as string[]));
    expect(result).toHaveLength(7);
  });

  it("filters by explicit tool names", () => {
    const result = filterTools(allTools, { tools: ["get_messages", "send_message"] });
    expect(result).toHaveLength(2);
    expect(result.map((t) => t.name)).toEqual(["get_messages", "send_message"]);
  });

  it("explicit tools override profile", () => {
    const result = filterTools(allTools, {
      profile: "monitoring",
      tools: ["get_messages"],
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("get_messages");
  });

  it("throws on unknown profile", () => {
    expect(() => filterTools(allTools, { profile: "nonexistent" })).toThrow(
      'Unknown profile "nonexistent"',
    );
  });

  it("throws on unknown tool names", () => {
    expect(() => filterTools(allTools, { tools: ["fake_tool"] })).toThrow(
      "Unknown tool names: fake_tool",
    );
  });

  // --- add/remove overrides ---

  it("adds tools to a profile via add", () => {
    const result = filterTools(allTools, {
      profile: "monitoring",
      add: ["list_channels"],
    });
    const names = new Set(result.map((t) => t.name));
    // Original 6 + list_channels
    expect(result).toHaveLength(7);
    expect(names).toContain("list_channels");
    // Still has all the original monitoring tools
    for (const t of PROFILES.monitoring as string[]) {
      expect(names).toContain(t);
    }
  });

  it("removes tools from a profile via remove", () => {
    const result = filterTools(allTools, {
      profile: "monitoring",
      remove: ["create_thread"],
    });
    const names = new Set(result.map((t) => t.name));
    expect(result).toHaveLength(5);
    expect(names).not.toContain("create_thread");
  });

  it("add and remove together", () => {
    const result = filterTools(allTools, {
      profile: "monitoring",
      add: ["list_channels", "query_audit_log"],
      remove: ["create_thread", "list_projects"],
    });
    const names = new Set(result.map((t) => t.name));
    // 6 - 2 removed + 2 added = 6
    expect(result).toHaveLength(6);
    expect(names).toContain("list_channels");
    expect(names).toContain("query_audit_log");
    expect(names).not.toContain("create_thread");
    expect(names).not.toContain("list_projects");
  });

  it("add/remove on full profile", () => {
    const result = filterTools(allTools, {
      profile: "full",
      remove: ["extra_tool"],
    });
    expect(result).toHaveLength(allTools.length - 1);
    expect(result.map((t) => t.name)).not.toContain("extra_tool");
  });

  it("add/remove ignored when explicit tools is set", () => {
    const result = filterTools(allTools, {
      tools: ["get_messages"],
      add: ["send_message"],
      remove: ["get_messages"],
    });
    // --tools takes full precedence, add/remove ignored
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe("get_messages");
  });

  it("adding a tool already in the profile is a no-op", () => {
    const result = filterTools(allTools, {
      profile: "monitoring",
      add: ["get_messages"], // already there
    });
    expect(result).toHaveLength(6);
  });

  it("removing a tool not in the profile is a no-op", () => {
    const result = filterTools(allTools, {
      profile: "monitoring",
      remove: ["list_channels"], // not in monitoring
    });
    expect(result).toHaveLength(6);
  });

  it("throws on unknown tool names in add", () => {
    expect(() =>
      filterTools(allTools, { profile: "monitoring", add: ["nonexistent_tool"] }),
    ).toThrow("tool_profile_add references unknown tools: nonexistent_tool");
  });

  it("throws on unknown tool names in remove", () => {
    expect(() =>
      filterTools(allTools, { profile: "monitoring", remove: ["nonexistent_tool"] }),
    ).toThrow("tool_profile_remove references unknown tools: nonexistent_tool");
  });
});
