import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { getTokenForProject, loadConfig } from "../../src/config/index.js";
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

describe("DISCORD_OPS_TOKEN_ENV validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Supply an inline JSON config so loadGlobalConfig() never touches the filesystem.
    process.env.DISCORD_OPS_CONFIG = JSON.stringify({ projects: {} });
    // Supply a default token so loadConfig() doesn't fail on the "no token" guard.
    process.env.DISCORD_TOKEN = "fake-default-token";
    // Remove the variable under test so each case starts clean.
    delete process.env.DISCORD_OPS_TOKEN_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('accepts "DISCORD_TOKEN" (default — no DISCORD_OPS_TOKEN_ENV set)', () => {
    // DISCORD_OPS_TOKEN_ENV is absent; falls back to "DISCORD_TOKEN" which passes the regex.
    expect(() => loadConfig()).not.toThrow();
  });

  it('accepts a single uppercase letter "A"', () => {
    process.env.DISCORD_OPS_TOKEN_ENV = "A";
    process.env.A = "fake-token";
    expect(() => loadConfig()).not.toThrow();
  });

  it('accepts "MY_BOT_TOKEN"', () => {
    process.env.DISCORD_OPS_TOKEN_ENV = "MY_BOT_TOKEN";
    process.env.MY_BOT_TOKEN = "fake-token";
    expect(() => loadConfig()).not.toThrow();
  });

  it('rejects "lowercase" — starts with lowercase letter', () => {
    process.env.DISCORD_OPS_TOKEN_ENV = "lowercase";
    expect(() => loadConfig()).toThrow("DISCORD_OPS_TOKEN_ENV must be a valid env var name");
  });

  it('rejects "123STARTS_WITH_DIGIT" — starts with digit', () => {
    process.env.DISCORD_OPS_TOKEN_ENV = "123STARTS_WITH_DIGIT";
    expect(() => loadConfig()).toThrow("DISCORD_OPS_TOKEN_ENV must be a valid env var name");
  });

  it('rejects "HAS SPACES" — contains a space', () => {
    process.env.DISCORD_OPS_TOKEN_ENV = "HAS SPACES";
    expect(() => loadConfig()).toThrow("DISCORD_OPS_TOKEN_ENV must be a valid env var name");
  });

  it('rejects "HAS-DASHES" — contains a hyphen', () => {
    process.env.DISCORD_OPS_TOKEN_ENV = "HAS-DASHES";
    expect(() => loadConfig()).toThrow("DISCORD_OPS_TOKEN_ENV must be a valid env var name");
  });

  it("rejects empty string", () => {
    process.env.DISCORD_OPS_TOKEN_ENV = "";
    expect(() => loadConfig()).toThrow("DISCORD_OPS_TOKEN_ENV must be a valid env var name");
  });
});
