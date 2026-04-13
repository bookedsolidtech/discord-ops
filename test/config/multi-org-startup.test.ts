/**
 * Tests for loadConfig() with realistic multi-org configs where:
 * - Multiple projects across multiple guilds
 * - Each project uses its own token_env (no DISCORD_TOKEN default)
 * - Multiple distinct token_env values across the fleet
 * - Bot persona configs with token_env on the bot, not the project
 *
 * This mirrors production configs like Clarity House + Helix + BST
 * where DISCORD_TOKEN is never set.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  loadConfig,
  getTokenForProject,
  getTokenForBot,
  getTokenForChannel,
  getBotPersona,
} from "../../src/config/index.js";
import type { LoadedConfig, GlobalConfig } from "../../src/config/index.js";

describe("multi-org startup (no default token)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    // Explicitly remove DISCORD_TOKEN — the whole point of this test suite
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_OPS_TOKEN_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // Realistic multi-org config shape matching production usage
  const multiOrgConfig: GlobalConfig = {
    projects: {
      "clarity-house": {
        guild_id: "147677912386188508",
        token_env: "CLARITY_DISCORD_BOT_TOKEN",
        owners: ["820027414902079548"],
        notify_owners_on: ["release", "error", "alert"],
        channels: {
          general: "147677912603466141",
          dev: "148834946253022842",
          ops: "148834913008969735",
          builds: "148834932610210214",
          releases: "148834932610210214",
          alerts: "148834932610210214",
        },
        default_channel: "dev",
      },
      "clarity-house-ops": {
        guild_id: "147677912386188508",
        token_env: "CLARITY_DISCORD_BOT_TOKEN",
        channels: {
          dev: "148834946253022842",
          ops: "148834913008969735",
          builds: "148834932610210214",
          alerts: "148834932610210214",
        },
        default_channel: "ops",
      },
      helix: {
        guild_id: "147821583513393996",
        token_env: "BOOKED_DISCORD_BOT_TOKEN",
        owners: ["820027414902079548"],
        channels: {
          general: "148945389739442186",
          dev: "147821612326584742",
          releases: "148945406029673694",
          builds: "148945391980865143",
          alerts: "147821635209422449",
        },
        default_channel: "dev",
      },
      "booked-solid-tech": {
        guild_id: "147821583513393996",
        token_env: "BOOKED_DISCORD_BOT_TOKEN",
        channels: {
          general: "148945389739442186",
          dev: "148074089833693597",
          announcements: "148945405487769613",
          releases: "148945406029673694",
          builds: "148945391980865143",
          alerts: "147821635209422449",
        },
        default_channel: "dev",
      },
      "discord-ops": {
        guild_id: "147821583513393996",
        token_env: "BOOKED_DISCORD_BOT_TOKEN",
        channels: {
          dev: "148864121872344710",
          releases: "148945406029673694",
          builds: "148945391980865143",
          alerts: "147821635209422449",
        },
        default_channel: "dev",
      },
      "clarity-bot": {
        guild_id: "147677912386188508",
        token_env: "CLARITY_CLAIRE_DISCORD_BOT_TOKEN",
        channels: {
          "hey-claire": "149205859590131309",
          "bot-testing": "149232742577707846",
          general: "147677912603466141",
        },
        default_channel: "hey-claire",
      },
    },
    default_project: "clarity-house",
    notification_routing: {
      ci_build: "builds",
      deploy: "builds",
      release: "releases",
      error: "alerts",
      dev: "dev",
    },
  };

  it("loadConfig succeeds when all projects have token_env set (no default token)", () => {
    process.env.CLARITY_DISCORD_BOT_TOKEN = "fake-clarity-token";
    process.env.BOOKED_DISCORD_BOT_TOKEN = "fake-booked-token";
    process.env.CLARITY_CLAIRE_DISCORD_BOT_TOKEN = "fake-claire-token";
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(multiOrgConfig);

    const config = loadConfig();

    expect(config.defaultToken).toBeUndefined();
    expect(Object.keys(config.global.projects)).toHaveLength(6);
  });

  it("loadConfig succeeds with warning when one token_env is missing", () => {
    process.env.CLARITY_DISCORD_BOT_TOKEN = "fake-clarity-token";
    process.env.BOOKED_DISCORD_BOT_TOKEN = "fake-booked-token";
    delete process.env.CLARITY_CLAIRE_DISCORD_BOT_TOKEN;
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(multiOrgConfig);

    // Should not throw — clarity-bot is unavailable but others work fine
    const config = loadConfig();
    expect(config.defaultToken).toBeUndefined();
    expect(Object.keys(config.global.projects)).toHaveLength(6);
  });

  it("loadConfig succeeds with warnings when multiple projects have missing tokens", () => {
    process.env.CLARITY_DISCORD_BOT_TOKEN = "fake-clarity-token";
    delete process.env.BOOKED_DISCORD_BOT_TOKEN;
    delete process.env.CLARITY_CLAIRE_DISCORD_BOT_TOKEN;
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(multiOrgConfig);

    // clarity-house and clarity-house-ops are available — should not throw
    const config = loadConfig();
    expect(config.defaultToken).toBeUndefined();
    expect(Object.keys(config.global.projects)).toHaveLength(6);
  });

  it("loadConfig throws when ALL projects have missing tokens", () => {
    delete process.env.CLARITY_DISCORD_BOT_TOKEN;
    delete process.env.BOOKED_DISCORD_BOT_TOKEN;
    delete process.env.CLARITY_CLAIRE_DISCORD_BOT_TOKEN;
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(multiOrgConfig);

    expect(() => loadConfig()).toThrow();
  });

  it("getTokenForProject returns correct per-project token", () => {
    process.env.CLARITY_DISCORD_BOT_TOKEN = "clarity-token-123";
    process.env.BOOKED_DISCORD_BOT_TOKEN = "booked-token-456";
    process.env.CLARITY_CLAIRE_DISCORD_BOT_TOKEN = "claire-token-789";
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(multiOrgConfig);

    const config = loadConfig();

    expect(getTokenForProject("clarity-house", config)).toBe("clarity-token-123");
    expect(getTokenForProject("clarity-house-ops", config)).toBe("clarity-token-123");
    expect(getTokenForProject("helix", config)).toBe("booked-token-456");
    expect(getTokenForProject("booked-solid-tech", config)).toBe("booked-token-456");
    expect(getTokenForProject("discord-ops", config)).toBe("booked-token-456");
    expect(getTokenForProject("clarity-bot", config)).toBe("claire-token-789");
  });

  it("getTokenForProject throws with clear message when env var missing and no default", () => {
    // Build a config directly (not via loadConfig, which would throw first)
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: multiOrgConfig,
    };
    process.env.CLARITY_DISCORD_BOT_TOKEN = "clarity-token";
    delete process.env.BOOKED_DISCORD_BOT_TOKEN;

    expect(() => getTokenForProject("helix", config)).toThrow("BOOKED_DISCORD_BOT_TOKEN");
  });

  it("same token_env across projects returns same token", () => {
    process.env.CLARITY_DISCORD_BOT_TOKEN = "shared-clarity-token";
    process.env.BOOKED_DISCORD_BOT_TOKEN = "shared-booked-token";
    process.env.CLARITY_CLAIRE_DISCORD_BOT_TOKEN = "claire-token";
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(multiOrgConfig);

    const config = loadConfig();

    // clarity-house and clarity-house-ops share the same token_env
    const t1 = getTokenForProject("clarity-house", config);
    const t2 = getTokenForProject("clarity-house-ops", config);
    expect(t1).toBe(t2);
    expect(t1).toBe("shared-clarity-token");
  });
});

describe("multi-org startup with bot personas (no default token)", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_OPS_TOKEN_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const botPersonaConfig: GlobalConfig = {
    bots: {
      claire: {
        name: "Claire",
        role: "Community helper",
        token_env: "CLAIRE_BOT_TOKEN",
        default_profile: "messaging",
      },
      courier: {
        name: "Clarity Courier",
        role: "Technical operations",
        token_env: "COURIER_BOT_TOKEN",
        default_profile: "full",
      },
    },
    projects: {
      "clarity-house": {
        guild_id: "147677912386188508",
        bot: "courier",
        channels: {
          general: "147677912603466141",
          support: { id: "222222222222222222", bot: "claire" },
          "dev-ops": "333333333333333333",
          "ai-testing": { id: "444444444444444444", bot: "claire" },
        },
        default_channel: "dev-ops",
      },
      helix: {
        guild_id: "147821583513393996",
        token_env: "HELIX_TOKEN",
        channels: {
          dev: "555555555555555555",
        },
        default_channel: "dev",
      },
    },
    default_project: "clarity-house",
  };

  it("loadConfig succeeds when bot-based projects have token_env set", () => {
    process.env.CLAIRE_BOT_TOKEN = "fake-claire";
    process.env.COURIER_BOT_TOKEN = "fake-courier";
    process.env.HELIX_TOKEN = "fake-helix";
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(botPersonaConfig);

    const config = loadConfig();

    expect(config.defaultToken).toBeUndefined();
    expect(Object.keys(config.global.projects)).toHaveLength(2);
    expect(Object.keys(config.global.bots!)).toHaveLength(2);
  });

  it("loadConfig succeeds with warning when bot token_env is missing but other project has token", () => {
    // COURIER_BOT_TOKEN not set — clarity-house uses bot: "courier"
    process.env.CLAIRE_BOT_TOKEN = "fake-claire";
    process.env.HELIX_TOKEN = "fake-helix";
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(botPersonaConfig);

    // clarity-house unavailable, helix available — should not throw
    const config = loadConfig();
    expect(config.defaultToken).toBeUndefined();
    expect(Object.keys(config.global.projects)).toHaveLength(2);
  });

  it("getTokenForProject resolves bot token for bot-based project", () => {
    process.env.COURIER_BOT_TOKEN = "courier-token-value";
    process.env.CLAIRE_BOT_TOKEN = "claire-token-value";
    process.env.HELIX_TOKEN = "helix-token-value";

    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    expect(getTokenForProject("clarity-house", config)).toBe("courier-token-value");
    expect(getTokenForProject("helix", config)).toBe("helix-token-value");
  });

  it("getTokenForBot resolves named bot token", () => {
    process.env.CLAIRE_BOT_TOKEN = "claire-token-value";
    process.env.COURIER_BOT_TOKEN = "courier-token-value";

    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    expect(getTokenForBot("claire", config)).toBe("claire-token-value");
    expect(getTokenForBot("courier", config)).toBe("courier-token-value");
  });

  it("getTokenForBot throws for undefined bot name", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    expect(() => getTokenForBot("nonexistent", config)).toThrow('Bot "nonexistent" not found');
  });

  it("getTokenForBot throws when bot token_env is not set", () => {
    // CLAIRE_BOT_TOKEN intentionally not set
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    expect(() => getTokenForBot("claire", config)).toThrow("CLAIRE_BOT_TOKEN");
  });

  it("getTokenForChannel returns channel-level bot token", () => {
    process.env.CLAIRE_BOT_TOKEN = "claire-channel-token";
    process.env.COURIER_BOT_TOKEN = "courier-token";

    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    // "support" has bot: "claire" override
    expect(getTokenForChannel("clarity-house", "support", config)).toBe("claire-channel-token");
  });

  it("getTokenForChannel falls back to project-level bot for plain channels", () => {
    process.env.CLAIRE_BOT_TOKEN = "claire-token";
    process.env.COURIER_BOT_TOKEN = "courier-project-token";

    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    // "general" has no bot override → project bot "courier"
    expect(getTokenForChannel("clarity-house", "general", config)).toBe("courier-project-token");
  });

  it("getBotPersona returns channel-level bot persona", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    const persona = getBotPersona("clarity-house", "support", config);
    expect(persona).toBeDefined();
    expect(persona!.name).toBe("Claire");
    expect(persona!.role).toBe("Community helper");
    expect(persona!.key).toBe("claire");
  });

  it("getBotPersona returns project-level bot for plain channels", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    const persona = getBotPersona("clarity-house", "general", config);
    expect(persona).toBeDefined();
    expect(persona!.name).toBe("Clarity Courier");
    expect(persona!.key).toBe("courier");
  });

  it("getBotPersona returns undefined for project with no bot", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    const persona = getBotPersona("helix", "dev", config);
    expect(persona).toBeUndefined();
  });

  it("getBotPersona returns undefined for nonexistent project", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: botPersonaConfig,
    };

    expect(getBotPersona("nonexistent", undefined, config)).toBeUndefined();
  });

  it("getBotPersona returns undefined when config has no bots section", () => {
    const config: LoadedConfig = {
      defaultToken: undefined,
      global: { projects: botPersonaConfig.projects },
    };

    expect(getBotPersona("clarity-house", "support", config)).toBeUndefined();
  });
});

describe("mixed config: some projects with bot, some with token_env, no default", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.DISCORD_TOKEN;
    delete process.env.DISCORD_OPS_TOKEN_ENV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mixedConfig: GlobalConfig = {
    bots: {
      courier: {
        name: "Courier",
        token_env: "COURIER_TOKEN",
        default_profile: "full",
      },
    },
    projects: {
      "bot-project": {
        guild_id: "111111111111111111",
        bot: "courier",
        channels: { dev: "222222222222222222" },
        default_channel: "dev",
      },
      "token-project": {
        guild_id: "333333333333333333",
        token_env: "DIRECT_TOKEN",
        channels: { dev: "444444444444444444" },
        default_channel: "dev",
      },
    },
  };

  it("loadConfig succeeds when bot and token_env projects both have tokens", () => {
    process.env.COURIER_TOKEN = "courier-val";
    process.env.DIRECT_TOKEN = "direct-val";
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(mixedConfig);

    const config = loadConfig();
    expect(config.defaultToken).toBeUndefined();

    expect(getTokenForProject("bot-project", config)).toBe("courier-val");
    expect(getTokenForProject("token-project", config)).toBe("direct-val");
  });

  it("loadConfig succeeds with warning when bot token_env missing but token_env project is fine", () => {
    // COURIER_TOKEN not set
    process.env.DIRECT_TOKEN = "direct-val";
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(mixedConfig);

    // bot-project unavailable, token-project available — should not throw
    const config = loadConfig();
    expect(config.defaultToken).toBeUndefined();
  });

  it("loadConfig succeeds with warning when token_env project missing but bot project is fine", () => {
    process.env.COURIER_TOKEN = "courier-val";
    // DIRECT_TOKEN not set
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(mixedConfig);

    // token-project unavailable, bot-project available — should not throw
    const config = loadConfig();
    expect(config.defaultToken).toBeUndefined();
  });

  it("loadConfig throws when all projects have missing tokens", () => {
    // Neither COURIER_TOKEN nor DIRECT_TOKEN set
    process.env.DISCORD_OPS_CONFIG = JSON.stringify(mixedConfig);

    expect(() => loadConfig()).toThrow();
  });
});
