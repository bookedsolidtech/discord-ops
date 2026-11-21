import { describe, it, expect, vi } from "vitest";
import { sendAs } from "../../src/tools/personas/send-as.js";
import { listPersonas } from "../../src/tools/personas/list-personas.js";
import {
  createMockChannel,
  createMockConfig,
  createMockDiscordClient,
  createMockWebhook,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

const BOT_ID = "100000000000000000";

function createCtx(personas: Record<string, unknown>) {
  const config = createMockConfig() as any;
  config.global.projects["test-project"].personas = personas;
  const webhook = createMockWebhook({ owner: { id: BOT_ID, tag: "TestBot#0001" } });
  const channel = createMockChannel({
    fetchWebhooks: vi.fn().mockResolvedValue(new Map([[webhook.id, webhook]])),
  });
  const discord = createMockDiscordClient() as any;
  discord.getChannel.mockResolvedValue(channel);
  const ctx: ToolContext = { discord, config };
  return { ctx, webhook, discord };
}

const presets = {
  meelah: {
    name: "Meelah",
    avatar_url: "https://cdn.example.com/meelah.png",
    color: 0xff66cc,
    footer: "Meelah Says",
    default_channel: "builds",
  },
  sprout: { name: "Sprout" },
};

describe("send_as persona presets", () => {
  it("applies name, avatar, default_channel, and embed color/footer for a preset key", async () => {
    const { ctx, webhook, discord } = createCtx(presets);
    const result = await sendAs.handle(
      {
        persona_name: "MEELAH",
        embeds: [{ title: "Hi" }, { title: "Two", color: 1, footer: { text: "own" } }],
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(discord.getChannel).toHaveBeenCalledWith("666666666666666666", expect.anything()); // "builds"
    expect(webhook.send).toHaveBeenCalledWith(
      expect.objectContaining({
        username: "Meelah",
        avatarURL: "https://cdn.example.com/meelah.png",
        embeds: [
          { title: "Hi", color: 0xff66cc, footer: { text: "Meelah Says" } },
          { title: "Two", color: 1, footer: { text: "own" } },
        ],
      }),
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.persona).toBe("Meelah");
    expect(data.preset).toBe("meelah");
  });

  it("matches by preset name too", async () => {
    const { ctx, webhook } = createCtx({ cc: { name: "Counting Cubes" } });
    await sendAs.handle({ persona_name: "counting cubes", content: "baa" }, ctx);
    expect(webhook.send).toHaveBeenCalledWith(
      expect.objectContaining({ username: "Counting Cubes" }),
    );
  });

  it("lets caller avatar_url and channel override the preset", async () => {
    const { ctx, webhook, discord } = createCtx(presets);
    await sendAs.handle(
      {
        persona_name: "meelah",
        content: "hi",
        channel: "alerts",
        avatar_url: "https://cdn.example.com/other.png",
      },
      ctx,
    );
    expect(discord.getChannel).toHaveBeenCalledWith("777777777777777777", expect.anything());
    expect(webhook.send).toHaveBeenCalledWith(
      expect.objectContaining({ avatarURL: "https://cdn.example.com/other.png" }),
    );
  });

  it("does not apply default_channel when channel_id is given", async () => {
    const { ctx, discord } = createCtx(presets);
    await sendAs.handle(
      {
        persona_name: "meelah",
        content: "hi",
        channel_id: "555555555555555555",
        project: "test-project",
      },
      ctx,
    );
    expect(discord.getChannel).toHaveBeenCalledWith("555555555555555555", expect.anything());
  });

  it("keeps today's behavior for unknown persona names", async () => {
    const { ctx, webhook, discord } = createCtx(presets);
    const result = await sendAs.handle({ persona_name: "Scout", content: "hi" }, ctx);
    expect(discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything()); // default "dev"
    const payload = (webhook.send as any).mock.calls[0][0];
    expect(payload.username).toBe("Scout");
    expect(payload.avatarURL).toBeUndefined();
    expect(JSON.parse(result.content[0]!.text).preset).toBeUndefined();
  });

  it("allows a preset default channel served by a permitted bot when the project bot is readonly", async () => {
    const { ctx, webhook } = createCtx({ m: { name: "Meelah", default_channel: "builds" } });
    (ctx.config.global as any).bots = {
      reader: { name: "Reader", token_env: "READER_TOKEN", default_profile: "readonly" },
      writer: { name: "Writer", token_env: "WRITER_TOKEN", default_profile: "messaging" },
    };
    const project = ctx.config.global.projects["test-project"] as any;
    project.bot = "reader";
    project.channels.builds = { id: "666666666666666666", bot: "writer" };
    process.env.WRITER_TOKEN = "w".repeat(60);
    try {
      const result = await sendAs.handle(
        { persona_name: "m", content: "hi", project: "test-project" },
        ctx,
      );
      expect(result.isError).toBeUndefined();
      expect(webhook.send).toHaveBeenCalled();
    } finally {
      delete process.env.WRITER_TOKEN;
    }
  });

  it("refuses a preset default_channel that is not an exact alias", async () => {
    // "bilds" would fuzzy-match "builds"; a preset default must not.
    const { ctx, webhook } = createCtx({ m: { name: "Meelah", default_channel: "bilds" } });
    const result = await sendAs.handle({ persona_name: "m", content: "hi" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not a configured channel alias/);
    expect(webhook.send).not.toHaveBeenCalled();
  });

  it("applies the profile gate to the bot serving a preset default channel", async () => {
    const { ctx, webhook } = createCtx({ m: { name: "Meelah", default_channel: "builds" } });
    (ctx.config.global as any).bots = {
      reader: { name: "Reader", token_env: "READER_TOKEN", default_profile: "readonly" },
    };
    (ctx.config.global.projects["test-project"].channels as any).builds = {
      id: "666666666666666666",
      bot: "reader",
    };
    const result = await sendAs.handle({ persona_name: "m", content: "hi" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/"readonly" profile/);
    expect(webhook.send).not.toHaveBeenCalled();
  });

  it("still validates a preset avatar with isPublicHttpUrl", async () => {
    // A config that bypassed schema validation must still not reach Discord.
    const { ctx, webhook } = createCtx({
      bad: { name: "Bad", avatar_url: "http://169.254.169.254/x" },
    });
    const result = await sendAs.handle({ persona_name: "bad", content: "hi" }, ctx);
    expect(result.isError).toBe(true);
    expect(webhook.send).not.toHaveBeenCalled();
  });
});

describe("list_personas presets", () => {
  it("includes presets for a resolved project, without avatar URLs or webhook secrets", async () => {
    const { ctx } = createCtx(presets);
    const result = await listPersonas.handle({ project: "test-project" }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.presets).toEqual([
      {
        key: "meelah",
        name: "Meelah",
        has_avatar: true,
        color: 0xff66cc,
        default_channel: "builds",
      },
      { key: "sprout", name: "Sprout", has_avatar: false, color: null, default_channel: null },
    ]);
    const text = result.content[0]!.text;
    expect(text).not.toContain("webhook-token");
    expect(text).not.toContain("cdn.example.com");
  });

  it("includes presets on a channel-scoped listing", async () => {
    const { ctx } = createCtx(presets);
    const result = await listPersonas.handle({ project: "test-project", channel: "dev" }, ctx);
    expect(JSON.parse(result.content[0]!.text).presets).toHaveLength(2);
  });

  it("omits presets for a direct guild_id listing", async () => {
    const { ctx } = createCtx(presets);
    const result = await listPersonas.handle({ guild_id: "444444444444444444" }, ctx);
    expect(JSON.parse(result.content[0]!.text).presets).toBeUndefined();
  });
});
