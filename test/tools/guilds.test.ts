import { describe, it, expect } from "vitest";
import { listGuilds } from "../../src/tools/guilds/list-guilds.js";
import { getGuild } from "../../src/tools/guilds/get-guild.js";
import { createInvite } from "../../src/tools/guilds/create-invite.js";
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

describe("create_invite", () => {
  it("has destructive: true", () => {
    expect(createInvite.destructive).toBe(true);
  });

  it("defaults max_uses to 1 in schema", () => {
    // Verify the zod schema default for max_uses is 1, not 0
    const parsed = createInvite.inputSchema.parse({ channel_id: "222222222222222222" });
    expect(parsed.max_uses).toBe(1);
  });

  it("creates invite and returns invite details", async () => {
    const ctx = createCtx();
    const result = await createInvite.handle(
      { channel_id: "222222222222222222", max_uses: 1 },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.code).toBe("abc123");
    expect(data.url).toBe("https://discord.gg/abc123");
  });

  it("allows max_uses=0 for unlimited when explicit", () => {
    // Verify zod accepts 0 explicitly (would throw if not valid)
    const parsed = createInvite.inputSchema.parse({
      channel_id: "222222222222222222",
      max_uses: 0,
    });
    expect(parsed.max_uses).toBe(0);
  });

  it("returns dry_run response without creating invite", async () => {
    const ctx = createCtx();
    const result = await createInvite.handle(
      { channel_id: "222222222222222222", dry_run: true },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.dry_run).toBe(true);
    expect(data.would_have).toContain("222222222222222222");
  });
});
