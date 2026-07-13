import { describe, it, expect } from "vitest";
import { computeBoardDefault, buildMcpJson } from "../../src/cli/setup.js";

// ---------------------------------------------------------------------------
// computeBoardDefault — mirrors resolveBoardChannel's fallback chain
// ---------------------------------------------------------------------------

describe("computeBoardDefault", () => {
  it("prefers an explicit `board` alias", () => {
    expect(computeBoardDefault({ board: "1", dev: "2", "agent-logs": "3" }, "dev")).toBe("board");
  });

  it("falls back through agent-board → agent-logs → backchannel", () => {
    expect(computeBoardDefault({ "agent-board": "1", dev: "2" }, "dev")).toBe("agent-board");
    expect(computeBoardDefault({ "agent-logs": "1", dev: "2" }, "dev")).toBe("agent-logs");
    expect(computeBoardDefault({ backchannel: "1", dev: "2" }, "dev")).toBe("backchannel");
  });

  it("falls back to the default channel when no coordination alias exists", () => {
    expect(computeBoardDefault({ dev: "1", builds: "2" }, "dev")).toBe("dev");
  });

  it("returns undefined when there is no default and no coordination alias", () => {
    expect(computeBoardDefault({ builds: "1" }, undefined)).toBeUndefined();
  });

  it("honors alias precedence when several are present", () => {
    // board wins over agent-logs wins over backchannel
    expect(computeBoardDefault({ backchannel: "1", "agent-logs": "2", board: "3" }, "dev")).toBe(
      "board",
    );
    expect(computeBoardDefault({ backchannel: "1", "agent-logs": "2" }, "dev")).toBe("agent-logs");
  });
});

// ---------------------------------------------------------------------------
// buildMcpJson — writes/merges the Claude Code MCP server entry
// ---------------------------------------------------------------------------

describe("buildMcpJson", () => {
  it("creates a discord-ops server entry from nothing", () => {
    const result = buildMcpJson(undefined, "BOOKED_DISCORD_BOT_TOKEN");
    expect(result).toEqual({
      mcpServers: {
        "discord-ops": {
          command: "npx",
          args: ["-y", "discord-ops@latest"],
          env: { BOOKED_DISCORD_BOT_TOKEN: "${BOOKED_DISCORD_BOT_TOKEN}" },
        },
      },
    });
  });

  it("references the env var by name, never a raw token value", () => {
    const result = buildMcpJson(undefined, "MY_TOKEN");
    const env = (result.mcpServers["discord-ops"] as { env: Record<string, string> }).env;
    expect(env.MY_TOKEN).toBe("${MY_TOKEN}");
  });

  it("preserves other mcpServers already present", () => {
    const existing = {
      mcpServers: { other: { command: "node", args: ["x.js"] } },
      someTopLevel: true,
    };
    const result = buildMcpJson(existing, "TOKEN") as typeof existing & {
      mcpServers: Record<string, unknown>;
    };
    expect(result.mcpServers.other).toEqual({ command: "node", args: ["x.js"] });
    expect(result.mcpServers["discord-ops"]).toBeDefined();
    expect(result.someTopLevel).toBe(true);
  });

  it("overwrites a stale discord-ops entry rather than duplicating it", () => {
    const existing = {
      mcpServers: { "discord-ops": { command: "old", args: [], env: { OLD: "x" } } },
    };
    const result = buildMcpJson(existing, "NEW_TOKEN");
    const server = result.mcpServers["discord-ops"] as {
      command: string;
      env: Record<string, string>;
    };
    expect(server.command).toBe("npx");
    expect(server.env).toEqual({ NEW_TOKEN: "${NEW_TOKEN}" });
  });

  it("tolerates malformed existing input (array / primitive)", () => {
    expect(buildMcpJson([], "T").mcpServers["discord-ops"]).toBeDefined();
    expect(buildMcpJson("nope", "T").mcpServers["discord-ops"]).toBeDefined();
  });
});
