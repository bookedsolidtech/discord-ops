import { describe, it, expect } from "vitest";
import { resolveTarget } from "../../src/routing/resolver.js";
import { testGlobalConfig, testPerProjectConfig } from "../fixtures/config.js";
import type { LoadedConfig } from "../../src/config/index.js";

const DEFAULT_TOKEN = "fake-token-that-is-long-enough-to-pass-validation-check-abcdefgh";

const config: LoadedConfig = {
  defaultToken: DEFAULT_TOKEN,
  global: testGlobalConfig,
  perProject: undefined,
};

describe("resolveTarget", () => {
  it("resolves direct channel_id", async () => {
    const result = await resolveTarget({ channel_id: "999999999999999999" }, config);
    expect(result).toEqual({
      guildId: "",
      channelId: "999999999999999999",
      project: undefined,
    });
  });

  it("resolves project + channel alias", async () => {
    const result = await resolveTarget({ project: "clarity-house", channel: "builds" }, config);
    expect(result).toEqual({
      guildId: "900000000000000001",
      channelId: "222222222222222222",
      project: "clarity-house",
      token: DEFAULT_TOKEN,
    });
  });

  it("resolves notification_type via global routing", async () => {
    const result = await resolveTarget(
      { project: "clarity-house", notification_type: "error" },
      config,
    );
    expect(result).toEqual({
      guildId: "900000000000000001",
      channelId: "444444444444444444",
      project: "clarity-house",
      token: DEFAULT_TOKEN,
    });
  });

  it("falls back to default_channel", async () => {
    const result = await resolveTarget({ project: "clarity-house" }, config);
    expect(result).toEqual({
      guildId: "900000000000000001",
      channelId: "111111111111111111",
      project: "clarity-house",
      token: DEFAULT_TOKEN,
    });
  });

  it("uses default_project when project not specified", async () => {
    const result = await resolveTarget({}, config);
    expect(result).toEqual({
      guildId: "900000000000000001",
      channelId: "111111111111111111",
      project: "clarity-house",
      token: DEFAULT_TOKEN,
    });
  });

  it("per-project config overrides default project", async () => {
    const configWithPerProject: LoadedConfig = {
      ...config,
      perProject: testPerProjectConfig,
    };
    const result = await resolveTarget({}, configWithPerProject);
    expect(result).toEqual({
      guildId: "900000000000000001",
      channelId: "666666666666666666",
      project: "helix",
      token: DEFAULT_TOKEN,
    });
  });

  it("per-project notification_routing overrides global", async () => {
    const configWithPerProject: LoadedConfig = {
      ...config,
      perProject: testPerProjectConfig,
    };
    const result = await resolveTarget({ notification_type: "ci_build" }, configWithPerProject);
    expect(result).toEqual({
      guildId: "900000000000000001",
      channelId: "777777777777777777",
      project: "helix",
      token: DEFAULT_TOKEN,
    });
  });

  it("returns error for unknown project", async () => {
    const result = await resolveTarget({ project: "nonexistent" }, config);
    expect(result).toHaveProperty("error");
  });

  it("returns error when no project and no default", async () => {
    const noDefaultConfig: LoadedConfig = {
      defaultToken: DEFAULT_TOKEN,
      global: { projects: {} },
      perProject: undefined,
    };
    const result = await resolveTarget({}, noDefaultConfig);
    expect(result).toHaveProperty("error");
  });
});
