import { describe, it, expect } from "vitest";
import { serverOptionsFromArgs } from "../../src/cli/tool-selection.js";
import { createServer } from "../../src/server.js";
import { allTools } from "../../src/tools/index.js";
import { PROFILES } from "../../src/profiles/index.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";

function serverFrom(args: string[]) {
  const ctx = { discord: createMockDiscordClient() as any, config: createMockConfig() as any };
  const { server, meta } = createServer(ctx, serverOptionsFromArgs(args));
  return { names: Object.keys((server as any)._registeredTools).sort(), meta };
}

describe("serverOptionsFromArgs", () => {
  it("returns no selection without the flags", () => {
    expect(serverOptionsFromArgs([])).toEqual({ dryRun: false });
    expect(serverOptionsFromArgs(["serve", "--dry-run"])).toEqual({ dryRun: true });
  });

  it("reads --profile and --tools", () => {
    expect(serverOptionsFromArgs(["--profile", "readonly"])).toEqual({
      dryRun: false,
      profile: "readonly",
    });
    expect(serverOptionsFromArgs(["serve", "--tools", " get_message, ,health_check "])).toEqual({
      dryRun: false,
      tools: ["get_message", "health_check"],
    });
  });

  it.each([
    [["--profile"], /--profile needs a value/],
    [["--profile", "--dry-run"], /--profile needs a value/],
    [["--tools", ""], /--tools needs a value/],
    [["--tools", " , "], /at least one tool name/],
    [["--profile", "readonly", "--profile", "full"], /given more than once/],
    [["--profile", "readonly", "--tools", "send_message"], /not both/],
    [["run", "delete_channel", "--profile", "readonly"], /not "run"/],
    [["health", "--tools", "health_check"], /not "health"/],
  ])("refuses %j", (args, message) => {
    expect(() => serverOptionsFromArgs(args)).toThrow(message);
  });

  it("ignores flags after a bare --", () => {
    expect(serverOptionsFromArgs(["--", "--profile"])).toEqual({ dryRun: false });
  });
});

describe("MCP server tool selection from the command line", () => {
  it("--profile readonly registers only the readonly tools", () => {
    const { names, meta } = serverFrom(["--profile", "readonly"]);
    expect(names).toEqual([...(PROFILES.readonly as string[])].sort());
    expect(names).not.toContain("delete_channel");
    expect(meta.profileName).toBe("readonly");
  });

  it("--tools registers only the listed tools", () => {
    const { names } = serverFrom(["serve", "--tools", "get_message,health_check"]);
    expect(names).toEqual(["get_message", "health_check"]);
  });

  it("no flag registers the full set", () => {
    expect(serverFrom([]).names).toHaveLength(allTools.length);
  });

  it("refuses an unknown profile or tool name", () => {
    expect(() => serverFrom(["--profile", "read-only"])).toThrow(/Unknown profile "read-only"/);
    expect(() => serverFrom(["--tools", "get_mesage"])).toThrow(/Unknown tool names: get_mesage/);
  });
});
