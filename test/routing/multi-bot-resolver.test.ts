import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveTarget } from "../../src/routing/resolver.js";
import { multiBotGlobalConfig } from "../fixtures/multi-bot-config.js";
import type { LoadedConfig } from "../../src/config/index.js";

const COURIER_TOKEN = "courier-fake-token-that-is-long-enough-to-pass-validation-check-abc";
const CLAIRE_TOKEN = "claire-fake-token-that-is-long-enough-to-pass-validation-check-abcde";
const DEFAULT_TOKEN = "default-fake-token-that-is-long-enough-to-pass-validation-check-abc";

describe("multi-bot resolveTarget", () => {
  beforeEach(() => {
    process.env.COURIER_TOKEN = COURIER_TOKEN;
    process.env.CLAIRE_TOKEN = CLAIRE_TOKEN;
  });

  afterEach(() => {
    delete process.env.COURIER_TOKEN;
    delete process.env.CLAIRE_TOKEN;
  });

  const config: LoadedConfig = {
    defaultToken: DEFAULT_TOKEN,
    global: multiBotGlobalConfig,
    perProject: undefined,
  };

  it("uses project-level bot token for plain channel", async () => {
    const result = await resolveTarget(
      { project: "clarity-house", channel: "general" },
      config,
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.channelId).toBe("111111111111111111");
    expect(result.token).toBe(COURIER_TOKEN);
    expect(result.bot).toEqual({ name: "Clarity Courier", role: "Technical operations" });
  });

  it("uses channel-level bot override token", async () => {
    const result = await resolveTarget(
      { project: "clarity-house", channel: "support" },
      config,
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.channelId).toBe("222222222222222222");
    expect(result.token).toBe(CLAIRE_TOKEN);
    expect(result.bot).toEqual({ name: "Claire", role: "Community helper" });
  });

  it("uses channel-level bot override for ai-testing", async () => {
    const result = await resolveTarget(
      { project: "clarity-house", channel: "ai-testing" },
      config,
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.channelId).toBe("444444444444444444");
    expect(result.token).toBe(CLAIRE_TOKEN);
    expect(result.bot).toEqual({ name: "Claire", role: "Community helper" });
  });

  it("falls back to default_channel with project bot", async () => {
    const result = await resolveTarget(
      { project: "clarity-house" },
      config,
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.channelId).toBe("333333333333333333");
    expect(result.token).toBe(COURIER_TOKEN);
    expect(result.bot).toEqual({ name: "Clarity Courier", role: "Technical operations" });
  });

  it("resolves notification_type with correct bot", async () => {
    const result = await resolveTarget(
      { project: "clarity-house", notification_type: "error" },
      config,
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    // error → dev-ops (plain channel, project bot = courier)
    expect(result.channelId).toBe("333333333333333333");
    expect(result.token).toBe(COURIER_TOKEN);
  });

  it("project without bot falls back to default token", async () => {
    const result = await resolveTarget(
      { project: "helix", channel: "dev" },
      config,
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.channelId).toBe("555555555555555555");
    expect(result.token).toBe(DEFAULT_TOKEN);
    expect(result.bot).toBeUndefined();
  });

  it("direct channel_id bypasses bot routing", async () => {
    const result = await resolveTarget(
      { channel_id: "999999999999999999" },
      config,
    );
    expect(result).not.toHaveProperty("error");
    if ("error" in result) return;
    expect(result.channelId).toBe("999999999999999999");
    expect(result.token).toBeUndefined();
    expect(result.bot).toBeUndefined();
  });
});
