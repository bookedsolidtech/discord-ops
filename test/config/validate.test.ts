import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { validateConfig } from "../../src/config/validate.js";
import type { LoadedConfig } from "../../src/config/index.js";

describe("validateConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("passes with valid single-token config", () => {
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
      },
    };

    const result = validateConfig(config);
    expect(result.errors).toHaveLength(0);
    expect(result.projects).toHaveLength(1);
    expect(result.projects[0].tokenSet).toBe(true);
  });

  it("passes with valid per-project tokens", () => {
    process.env.ORG_A_TOKEN = "fake-org-a-token-long-enough-for-validation-abcde";
    process.env.ORG_B_TOKEN = "fake-org-b-token-long-enough-for-validation-abcde";

    const config: LoadedConfig = {
      defaultToken: undefined,
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            default_channel: "dev",
            token_env: "ORG_A_TOKEN",
          },
          "org-b": {
            guild_id: "33333333333333333",
            channels: { dev: "44444444444444444" },
            default_channel: "dev",
            token_env: "ORG_B_TOKEN",
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.errors).toHaveLength(0);
    expect(result.projects).toHaveLength(2);
    expect(result.projects.every((p) => p.tokenSet)).toBe(true);
  });

  it("warns when token_env is not set in environment", () => {
    // ORG_A_TOKEN is NOT set in env
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            token_env: "ORG_A_TOKEN",
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain("ORG_A_TOKEN");
    expect(result.warnings[0]).toContain("not set");
  });

  it("errors when no token and no token_env", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: {
        projects: {
          "my-app": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("no default token");
  });

  it("errors when default_channel references nonexistent alias", () => {
    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "my-app": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            default_channel: "nonexistent",
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("nonexistent");
    expect(result.errors[0]).toContain("default_channel");
  });

  it("errors when default_project does not exist", () => {
    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "my-app": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
          },
        },
        default_project: "nonexistent",
      },
    };

    const result = validateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain("nonexistent");
    expect(result.errors[0]).toContain("default_project");
  });

  it("warns about shared guild with different tokens", () => {
    process.env.ORG_A_TOKEN = "fake-org-a-token-long-enough-for-validation-abcde";

    const config: LoadedConfig = {
      defaultToken: "fake-default-token-long-enough-for-validation-abcde",
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            token_env: "ORG_A_TOKEN",
          },
          "org-b": {
            guild_id: "11111111111111111", // Same guild!
            channels: { dev: "33333333333333333" },
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("different tokens"))).toBe(true);
  });

  it("warns about shared guild with same token", () => {
    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "proj-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
          },
          "proj-b": {
            guild_id: "11111111111111111", // Same guild, same token
            channels: { builds: "33333333333333333" },
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some((w) => w.includes("consider merging"))).toBe(true);
  });

  it("warns about shared channel across projects with different tokens", () => {
    process.env.ORG_A_TOKEN = "fake-org-a-token-long-enough-for-validation-abcde";

    const config: LoadedConfig = {
      defaultToken: "fake-default-token-long-enough-for-validation-abcde",
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" }, // Same channel ID
            token_env: "ORG_A_TOKEN",
          },
          "org-b": {
            guild_id: "33333333333333333",
            channels: { dev: "22222222222222222" }, // Same channel ID, different token
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.warnings.some((w) => w.includes("22222222222222222"))).toBe(true);
  });

  it("warns about empty channels", () => {
    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "my-app": {
            guild_id: "11111111111111111",
            channels: {},
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.warnings.some((w) => w.includes("no channels"))).toBe(true);
  });

  it("warns about notification routing to nonexistent alias", () => {
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
        notification_routing: {
          error: "alerts", // "alerts" doesn't exist in my-app
        },
      },
    };

    const result = validateConfig(config);
    expect(result.warnings.some((w) => w.includes("alerts"))).toBe(true);
  });

  it("errors with no projects and no default token", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: { projects: {} },
    };

    const result = validateConfig(config);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns all projects with correct structure", () => {
    process.env.CUSTOM_TOKEN = "fake-custom-token-long-enough-for-validation-abcde";

    const config: LoadedConfig = {
      defaultToken: "fake-token-long-enough-for-validation-abcdefghijklmnop",
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222", builds: "33333333333333333" },
            default_channel: "dev",
            token_env: "CUSTOM_TOKEN",
          },
          "org-b": {
            guild_id: "44444444444444444",
            channels: { general: "55555555555555555" },
          },
        },
      },
    };

    const result = validateConfig(config);
    expect(result.projects).toHaveLength(2);

    const orgA = result.projects.find((p) => p.name === "org-a");
    expect(orgA).toBeDefined();
    expect(orgA!.tokenEnv).toBe("CUSTOM_TOKEN");
    expect(orgA!.tokenSet).toBe(true);
    expect(orgA!.guildId).toBe("11111111111111111");

    const orgB = result.projects.find((p) => p.name === "org-b");
    expect(orgB).toBeDefined();
    expect(orgB!.tokenEnv).toBeUndefined();
    expect(orgB!.tokenSet).toBe(true); // has default token
  });
});
