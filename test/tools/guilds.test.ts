import { describe, it, expect } from "vitest";
import { listGuilds } from "../../src/tools/guilds/list-guilds.js";
import { getGuild } from "../../src/tools/guilds/get-guild.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

describe("list_guilds", () => {
  it("lists guilds", async () => {
    const ctx = createCtx();
    const result = await listGuilds.handle({}, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(1);
  });
});

describe("get_guild", () => {
  it("gets guild details", async () => {
    const ctx = createCtx();
    const result = await getGuild.handle({ guild_id: "444444444444444444" }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.id).toBe("444444444444444444");
  });
});
