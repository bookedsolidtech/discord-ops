import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listProjects } from "../../src/tools/system/list-projects.js";
import type { ToolContext } from "../../src/tools/types.js";
import type { LoadedConfig } from "../../src/config/index.js";

function createMockCtx(config: LoadedConfig): ToolContext {
  return {
    discord: {} as any,
    config,
  };
}

describe("list_projects tool", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns all configured projects", async () => {
    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222", builds: "33333333333333333" },
            default_channel: "dev",
          },
          "org-b": {
            guild_id: "44444444444444444",
            channels: { general: "55555555555555555" },
          },
        },
        default_project: "org-a",
      },
    };

    const result = await listProjects.handle({}, createMockCtx(config));
    const data = JSON.parse(result.content[0].text);

    expect(data.project_count).toBe(2);
    expect(data.projects).toHaveLength(2);
    expect(data.default_project).toBe("org-a");
    expect(data.has_default_token).toBe(true);
  });

  it("shows token_env status per project", async () => {
    process.env.ORG_A_TOKEN = "some-token";

    const config: LoadedConfig = {
      defaultToken: undefined,
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            token_env: "ORG_A_TOKEN",
          },
          "org-b": {
            guild_id: "33333333333333333",
            channels: { dev: "44444444444444444" },
            token_env: "ORG_B_TOKEN", // NOT set
          },
        },
      },
    };

    const result = await listProjects.handle({}, createMockCtx(config));
    const data = JSON.parse(result.content[0].text);

    const orgA = data.projects.find((p: any) => p.name === "org-a");
    expect(orgA.token_env).toBe("ORG_A_TOKEN");
    expect(orgA.token_set).toBe(true);

    const orgB = data.projects.find((p: any) => p.name === "org-b");
    expect(orgB.token_env).toBe("ORG_B_TOKEN");
    expect(orgB.token_set).toBe(false);

    // Should have errors for org-b
    expect(data.errors.length).toBeGreaterThan(0);
  });

  it("includes validation warnings", async () => {
    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: {},
          },
        },
      },
    };

    const result = await listProjects.handle({}, createMockCtx(config));
    const data = JSON.parse(result.content[0].text);

    expect(data.warnings).toBeDefined();
    expect(data.warnings.some((w: string) => w.includes("no channels"))).toBe(true);
  });

  it("shows notification routing when configured", async () => {
    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "my-app": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            default_channel: "dev",
          },
        },
        default_project: "my-app",
        notification_routing: { error: "dev", ci_build: "dev" },
      },
    };

    const result = await listProjects.handle({}, createMockCtx(config));
    const data = JSON.parse(result.content[0].text);

    expect(data.notification_routing).toBeDefined();
    expect(data.notification_routing.error).toBe("dev");
  });
});
