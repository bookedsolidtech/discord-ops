import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

vi.mock("../../src/tools/index.js", () => ({ allTools: [] }));
vi.mock("../../src/client.js", () => ({
  DiscordClient: vi.fn().mockImplementation(function () {
    return { destroy: vi.fn().mockResolvedValue(undefined) };
  }),
}));
vi.mock("../../src/config/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/config/index.js")>();
  return { ...actual, loadConfig: vi.fn() };
});

import { runTool } from "../../src/cli/run.js";
import { loadConfig } from "../../src/config/index.js";

const { allTools } = await import("../../src/tools/index.js");

function config(requireApproval: boolean) {
  return {
    defaultToken: "x".repeat(60),
    global: {
      projects: {
        "strawn-games": {
          guild_id: "444444444444444444",
          channels: { general: "200000000000000001" },
          posts: { require_approval: requireApproval },
        },
      },
    },
  };
}

describe("discord-ops run — require_approval", () => {
  const handle = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "sent" }] });

  beforeEach(() => {
    allTools.length = 0;
    handle.mockClear();
    allTools.push({
      name: "send_message",
      description: "",
      category: "messaging",
      inputSchema: z.object({ project: z.string(), channel: z.string(), content: z.string() }),
      handle,
    } as any);
  });

  it("refuses a direct post for a require_approval project without running the tool", async () => {
    vi.mocked(loadConfig).mockReturnValue(config(true) as any);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(
      runTool(
        "send_message",
        JSON.stringify({ project: "strawn-games", channel: "general", content: "hi" }),
      ),
    ).rejects.toThrow("exit 1");
    expect(err.mock.calls.flat().join(" ")).toMatch(/require_approval.*preview_post/);
    expect(handle).not.toHaveBeenCalled();
    exit.mockRestore();
    err.mockRestore();
  });

  it("runs the tool when require_approval is false", async () => {
    vi.mocked(loadConfig).mockReturnValue(config(false) as any);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await runTool(
      "send_message",
      JSON.stringify({ project: "strawn-games", channel: "general", content: "hi" }),
    );
    expect(handle).toHaveBeenCalled();
    log.mockRestore();
  });
});

describe("discord-ops run — deny_tools", () => {
  const handle = vi.fn().mockResolvedValue({ content: [{ type: "text", text: "deleted" }] });

  beforeEach(() => {
    allTools.length = 0;
    handle.mockClear();
    allTools.push({
      name: "delete_role",
      description: "",
      category: "roles",
      inputSchema: z.object({ guild_id: z.string(), role_id: z.string() }),
      handle,
    } as any);
  });

  async function run(denyTools: string[], guildId: string) {
    const cfg = config(false) as any;
    cfg.global.projects["strawn-games"].deny_tools = denyTools;
    vi.mocked(loadConfig).mockReturnValue(cfg);
    const exit = vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    let thrown: string | undefined;
    try {
      await runTool(
        "delete_role",
        JSON.stringify({ guild_id: guildId, role_id: "300000000000000001" }),
      );
    } catch (e) {
      thrown = (e as Error).message;
    }
    const text = err.mock.calls.flat().join(" ");
    [exit, err, log].forEach((s) => s.mockRestore());
    return { thrown, text };
  }

  it("refuses a denied tool in the project's guild", async () => {
    const { thrown, text } = await run(["delete_role"], "444444444444444444");
    expect(thrown).toBe("exit 1");
    expect(text).toMatch(/delete_role.*deny_tools/);
    expect(handle).not.toHaveBeenCalled();
  });

  it("refuses to run when deny_tools names an unsupported tool", async () => {
    const { thrown, text } = await run(["no_such_tool"], "444444444444444444");
    expect(thrown).toBe("exit 1");
    expect(text).toContain("no_such_tool");
    expect(handle).not.toHaveBeenCalled();
  });

  it("runs the tool in another guild", async () => {
    const { thrown } = await run(["delete_role"], "555555555555555555");
    expect(thrown).toBeUndefined();
    expect(handle).toHaveBeenCalled();
  });
});
