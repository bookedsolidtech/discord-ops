import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTokenForProject } from "../../src/config/index.js";
import type { LoadedConfig } from "../../src/config/index.js";

describe("getTokenForProject", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns default token when project has no token_env", () => {
    const config: LoadedConfig = {
      defaultToken: "default-token-value",
      global: {
        projects: {
          "my-app": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
          },
        },
      },
    };

    expect(getTokenForProject("my-app", config)).toBe("default-token-value");
  });

  it("returns per-project token when token_env is set", () => {
    process.env.ORG_A_TOKEN = "org-a-specific-token";

    const config: LoadedConfig = {
      defaultToken: "default-token-value",
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

    expect(getTokenForProject("org-a", config)).toBe("org-a-specific-token");
  });

  it("falls back to default token when token_env is not set in env", () => {
    // ORG_A_TOKEN is NOT in process.env
    const config: LoadedConfig = {
      defaultToken: "default-token-value",
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

    expect(getTokenForProject("org-a", config)).toBe("default-token-value");
  });

  it("throws when no default token and token_env not set", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            token_env: "MISSING_TOKEN",
          },
        },
      },
    };

    expect(() => getTokenForProject("org-a", config)).toThrow("MISSING_TOKEN");
  });

  it("throws when no default token and no token_env configured", () => {
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

    expect(() => getTokenForProject("my-app", config)).toThrow("my-app");
  });

  it("error message includes token_env name when configured but missing", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: {
        projects: {
          "org-a": {
            guild_id: "11111111111111111",
            channels: { dev: "22222222222222222" },
            token_env: "ORG_A_DISCORD_TOKEN",
          },
        },
      },
    };

    expect(() => getTokenForProject("org-a", config)).toThrow("ORG_A_DISCORD_TOKEN");
  });

  it("error message includes hint for projects without token_env", () => {
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

    expect(() => getTokenForProject("my-app", config)).toThrow("Add token_env");
  });

  it("handles multiple projects with different tokens", () => {
    process.env.ORG_A_TOKEN = "token-a";
    process.env.ORG_B_TOKEN = "token-b";

    const config: LoadedConfig = {
      defaultToken: "default-token",
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
            token_env: "ORG_B_TOKEN",
          },
          "org-c": {
            guild_id: "55555555555555555",
            channels: { dev: "66666666666666666" },
            // No token_env — uses default
          },
        },
      },
    };

    expect(getTokenForProject("org-a", config)).toBe("token-a");
    expect(getTokenForProject("org-b", config)).toBe("token-b");
    expect(getTokenForProject("org-c", config)).toBe("default-token");
  });
});
