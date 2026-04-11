import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { listBots } from "../../../src/tools/system/list-bots.js";
import { multiBotGlobalConfig } from "../../fixtures/multi-bot-config.js";
import type { ToolContext } from "../../../src/tools/types.js";
import type { LoadedConfig } from "../../../src/config/index.js";

function makeCtx(global = multiBotGlobalConfig): ToolContext {
  const config: LoadedConfig = {
    global,
    defaultToken: "fake-token-long-enough-for-validation-check-abcdefghijklmnopqrstuvwxyz",
    perProject: undefined,
  };
  return {
    config,
    discord: {} as any,
  };
}

describe("list_bots tool", () => {
  beforeEach(() => {
    process.env.CLAIRE_TOKEN = "fake-claire-token";
    process.env.COURIER_TOKEN = "fake-courier-token";
  });

  afterEach(() => {
    delete process.env.CLAIRE_TOKEN;
    delete process.env.COURIER_TOKEN;
  });

  it("returns all configured bots with metadata", async () => {
    const result = await listBots.handle({}, makeCtx());
    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    expect(data.bot_count).toBe(2);
    expect(data.bots).toHaveLength(2);

    const claire = data.bots.find((b: any) => b.key === "claire");
    expect(claire).toBeDefined();
    expect(claire.name).toBe("Claire");
    expect(claire.role).toBe("Community helper");
    expect(claire.default_profile).toBe("messaging");
    expect(claire.token_set).toBe(true);
  });

  it("reports project assignments", async () => {
    const result = await listBots.handle({}, makeCtx());
    const data = JSON.parse(result.content[0].text);

    const courier = data.bots.find((b: any) => b.key === "courier");
    expect(courier.projects).toContain("clarity-house");
  });

  it("reports channel overrides", async () => {
    const result = await listBots.handle({}, makeCtx());
    const data = JSON.parse(result.content[0].text);

    const claire = data.bots.find((b: any) => b.key === "claire");
    expect(claire.channel_overrides).toEqual(
      expect.arrayContaining([
        { project: "clarity-house", channel: "support" },
        { project: "clarity-house", channel: "ai-testing" },
      ]),
    );
  });

  it("does not expose token values", async () => {
    const result = await listBots.handle({}, makeCtx());
    const text = result.content[0].text;
    expect(text).not.toContain("CLAIRE_TOKEN");
    expect(text).not.toContain("COURIER_TOKEN");
    expect(text).not.toContain("fake-claire-token");
    expect(text).not.toContain("fake-courier-token");
  });

  it("reports token_set as false when env not set", async () => {
    delete process.env.CLAIRE_TOKEN;
    const result = await listBots.handle({}, makeCtx());
    const data = JSON.parse(result.content[0].text);

    const claire = data.bots.find((b: any) => b.key === "claire");
    expect(claire.token_set).toBe(false);
  });

  it("returns empty list when no bots configured", async () => {
    const result = await listBots.handle({}, makeCtx({
      projects: {
        test: {
          guild_id: "900000000000000001",
          channels: { dev: "111111111111111111" },
        },
      },
    }));
    const data = JSON.parse(result.content[0].text);
    expect(data.bot_count).toBe(0);
    expect(data.bots).toHaveLength(0);
  });
});
