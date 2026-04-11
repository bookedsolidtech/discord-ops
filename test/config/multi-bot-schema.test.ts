import { describe, it, expect } from "vitest";
import {
  BotPersonaSchema,
  ChannelConfigSchema,
  GlobalConfigSchema,
  ProjectConfigSchema,
  ToolProfileEnum,
} from "../../src/config/schema.js";

describe("ToolProfileEnum", () => {
  it("accepts all 7 profile names", () => {
    for (const name of ["full", "monitoring", "readonly", "moderation", "messaging", "channels", "webhooks"]) {
      expect(ToolProfileEnum.safeParse(name).success).toBe(true);
    }
  });

  it("rejects invalid profile names", () => {
    expect(ToolProfileEnum.safeParse("admin").success).toBe(false);
  });
});

describe("BotPersonaSchema", () => {
  it("accepts a valid bot persona", () => {
    const result = BotPersonaSchema.safeParse({
      name: "Claire",
      role: "Community helper",
      token_env: "CLAIRE_TOKEN",
      default_profile: "messaging",
    });
    expect(result.success).toBe(true);
  });

  it("requires name and token_env", () => {
    expect(BotPersonaSchema.safeParse({ token_env: "T" }).success).toBe(false);
    expect(BotPersonaSchema.safeParse({ name: "Bot" }).success).toBe(false);
  });

  it("accepts optional fields", () => {
    const result = BotPersonaSchema.safeParse({
      name: "Bot",
      token_env: "BOT_TOKEN",
      description: "A test bot",
      profile_add: ["kick_member"],
      profile_remove: ["send_message"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(BotPersonaSchema.safeParse({ name: "", token_env: "T" }).success).toBe(false);
  });
});

describe("ChannelConfigSchema", () => {
  it("accepts plain snowflake string", () => {
    const result = ChannelConfigSchema.safeParse("111111111111111111");
    expect(result.success).toBe(true);
  });

  it("accepts object with id", () => {
    const result = ChannelConfigSchema.safeParse({ id: "111111111111111111" });
    expect(result.success).toBe(true);
  });

  it("accepts object with id and bot", () => {
    const result = ChannelConfigSchema.safeParse({ id: "111111111111111111", bot: "claire" });
    expect(result.success).toBe(true);
  });

  it("rejects invalid snowflake", () => {
    expect(ChannelConfigSchema.safeParse("123").success).toBe(false);
    expect(ChannelConfigSchema.safeParse({ id: "abc" }).success).toBe(false);
  });
});

describe("ProjectConfigSchema with bot fields", () => {
  it("accepts project with bot reference", () => {
    const result = ProjectConfigSchema.safeParse({
      guild_id: "900000000000000001",
      bot: "courier",
      channels: { dev: "111111111111111111" },
      tool_profile: "full",
    });
    expect(result.success).toBe(true);
  });

  it("accepts mixed channel formats", () => {
    const result = ProjectConfigSchema.safeParse({
      guild_id: "900000000000000001",
      channels: {
        general: "111111111111111111",
        support: { id: "222222222222222222", bot: "claire" },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts profile_add and profile_remove", () => {
    const result = ProjectConfigSchema.safeParse({
      guild_id: "900000000000000001",
      channels: { dev: "111111111111111111" },
      profile_add: ["kick_member"],
      profile_remove: ["send_message"],
    });
    expect(result.success).toBe(true);
  });
});

describe("GlobalConfigSchema with bots", () => {
  it("accepts config with bots section", () => {
    const result = GlobalConfigSchema.safeParse({
      bots: {
        claire: {
          name: "Claire",
          role: "Community helper",
          token_env: "CLAIRE_TOKEN",
          default_profile: "messaging",
        },
      },
      projects: {
        test: {
          guild_id: "900000000000000001",
          bot: "claire",
          channels: { dev: "111111111111111111" },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts config without bots section (backwards compatible)", () => {
    const result = GlobalConfigSchema.safeParse({
      projects: {
        test: {
          guild_id: "900000000000000001",
          channels: { dev: "111111111111111111" },
        },
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts full multi-bot config", () => {
    const result = GlobalConfigSchema.safeParse({
      bots: {
        claire: { name: "Claire", token_env: "CLAIRE_TOKEN", default_profile: "messaging" },
        courier: { name: "Courier", token_env: "COURIER_TOKEN", default_profile: "full" },
      },
      projects: {
        "clarity-house": {
          guild_id: "900000000000000001",
          bot: "courier",
          channels: {
            general: "111111111111111111",
            support: { id: "222222222222222222", bot: "claire" },
          },
          default_channel: "general",
          tool_profile: "full",
        },
      },
      default_project: "clarity-house",
    });
    expect(result.success).toBe(true);
  });
});
