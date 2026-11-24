import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

describe("discord-ops run — dry-run and profiles", () => {
  const handle = vi.fn();
  const preflight = vi.fn();

  beforeEach(() => {
    vi.stubEnv("DRY_RUN", "");
    vi.stubEnv("DISCORD_OPS_DRY_RUN", "");
    handle.mockReset().mockResolvedValue({ content: [{ type: "text", text: "really ran" }] });
    preflight.mockReset().mockResolvedValue(undefined);
    allTools.length = 0;
    allTools.push({
      name: "delete_role",
      description: "",
      category: "roles",
      destructive: true,
      inputSchema: z.object({ project: z.string().optional() }),
      preflight,
      handle,
    } as any);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  async function run(options?: { dryRun?: boolean }, toolProfile?: string) {
    vi.mocked(loadConfig).mockReturnValue({
      defaultToken: "x".repeat(60),
      global: {
        projects: {
          p: {
            guild_id: "444444444444444444",
            channels: {},
            ...(toolProfile ? { tool_profile: toolProfile } : {}),
          },
        },
      },
    } as any);
    vi.spyOn(process, "exit").mockImplementation(((code: number) => {
      throw new Error(`exit ${code}`);
    }) as never);
    const out: string[] = [];
    const collect = (...a: unknown[]) => void out.push(a.join(" "));
    vi.spyOn(console, "log").mockImplementation(collect);
    vi.spyOn(console, "error").mockImplementation(collect);
    let thrown: string | undefined;
    try {
      await runTool("delete_role", JSON.stringify({ project: "p" }), options);
    } catch (e) {
      thrown = (e as Error).message;
    }
    return { thrown, text: out.join("\n") };
  }

  it.each(["DRY_RUN", "DISCORD_OPS_DRY_RUN"])(
    "does not run a destructive tool with %s",
    async (v) => {
      vi.stubEnv(v, "1");
      const { thrown, text } = await run();
      expect(thrown).toBeUndefined();
      expect(text).toContain("[DRY RUN]");
      expect(handle).not.toHaveBeenCalled();
    },
  );

  it("does not run a destructive tool with --dry-run", async () => {
    const { text } = await run({ dryRun: true });
    expect(text).toContain("[DRY RUN]");
    expect(handle).not.toHaveBeenCalled();
  });

  it("reports the preflight refusal in dry-run and exits 1", async () => {
    preflight.mockResolvedValue({ content: [{ type: "text", text: "refused" }], isError: true });
    const { thrown, text } = await run({ dryRun: true });
    expect(thrown).toBe("exit 1");
    expect(text).toContain("refused");
    expect(handle).not.toHaveBeenCalled();
  });

  it("runs the tool without dry-run", async () => {
    const { thrown, text } = await run();
    expect(thrown).toBeUndefined();
    expect(text).toContain("really ran");
  });

  it("refuses a tool the project's profile does not allow", async () => {
    const { thrown, text } = await run(undefined, "readonly");
    expect(thrown).toBe("exit 1");
    expect(text).toContain('"readonly" profile');
    expect(handle).not.toHaveBeenCalled();
  });
});
