import { describe, it, expect } from "vitest";
import { resolveTarget } from "../../src/routing/resolver.js";
import { testGlobalConfig, testPerProjectConfig } from "../fixtures/config.js";
import type { LoadedConfig } from "../../src/config/index.js";

const config: LoadedConfig = {
  token: "fake-token",
  global: testGlobalConfig,
  perProject: undefined,
};

describe("resolveTarget", () => {
  it("resolves direct channel_id", () => {
    const result = resolveTarget({ channel_id: "999999999999999999" }, config);
    expect(result).toEqual({
      guildId: "",
      channelId: "999999999999999999",
      project: undefined,
    });
  });

  it("resolves project + channel alias", () => {
    const result = resolveTarget({ project: "clarity-house", channel: "builds" }, config);
    expect(result).toEqual({
      guildId: "1476779123861885081",
      channelId: "222222222222222222",
      project: "clarity-house",
    });
  });

  it("resolves notification_type via global routing", () => {
    const result = resolveTarget({ project: "clarity-house", notification_type: "error" }, config);
    expect(result).toEqual({
      guildId: "1476779123861885081",
      channelId: "444444444444444444",
      project: "clarity-house",
    });
  });

  it("falls back to default_channel", () => {
    const result = resolveTarget({ project: "clarity-house" }, config);
    expect(result).toEqual({
      guildId: "1476779123861885081",
      channelId: "111111111111111111",
      project: "clarity-house",
    });
  });

  it("uses default_project when project not specified", () => {
    const result = resolveTarget({}, config);
    expect(result).toEqual({
      guildId: "1476779123861885081",
      channelId: "111111111111111111",
      project: "clarity-house",
    });
  });

  it("per-project config overrides default project", () => {
    const configWithPerProject: LoadedConfig = {
      ...config,
      perProject: testPerProjectConfig,
    };
    const result = resolveTarget({}, configWithPerProject);
    expect(result).toEqual({
      guildId: "1476779123861885081",
      channelId: "666666666666666666",
      project: "helix",
    });
  });

  it("per-project notification_routing overrides global", () => {
    const configWithPerProject: LoadedConfig = {
      ...config,
      perProject: testPerProjectConfig,
    };
    const result = resolveTarget({ notification_type: "ci_build" }, configWithPerProject);
    expect(result).toEqual({
      guildId: "1476779123861885081",
      channelId: "777777777777777777",
      project: "helix",
    });
  });

  it("returns error for unknown project", () => {
    const result = resolveTarget({ project: "nonexistent" }, config);
    expect(result).toHaveProperty("error");
  });

  it("returns error when no project and no default", () => {
    const noDefaultConfig: LoadedConfig = {
      token: "fake",
      global: { projects: {} },
      perProject: undefined,
    };
    const result = resolveTarget({}, noDefaultConfig);
    expect(result).toHaveProperty("error");
  });
});
