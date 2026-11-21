import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../src/posts/youtube.js", () => ({
  fetchYoutubeVideoInfo: vi.fn().mockResolvedValue({}),
}));

import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchYoutubeVideoInfo } from "../../src/posts/youtube.js";
import {
  previewPost,
  publishPost,
  sendPost,
  listPosts,
  previewPosts,
} from "../../src/tools/posts/index.js";
import { allTools } from "../../src/tools/index.js";
import { PROFILES } from "../../src/profiles/index.js";
import { ledgerPath, readLedger } from "../../src/posts/ledger.js";
import { PERSONA_WEBHOOK_NAME } from "../../src/tools/personas/persona-webhook.js";
import type { ToolContext } from "../../src/tools/types.js";

const mockOg = vi.mocked(fetchYoutubeVideoInfo);

const BOT_ID = "100000000000000000";
const GUILD = "444444444444444444";
const OWNER = "700000000000000001";
const APPROVER = "700000000000000002";
const MOD = "700000000000000003";
const KID = "700000000000000004";
const MOD_ROLE = "800000000000000001";
const CH = {
  preview: "500000000000000001",
  welcome: "500000000000000002",
  announcements: "500000000000000003",
  videos: "500000000000000004",
  forum: "500000000000000005",
  unlisted: "500000000000000006", // in the guild, not a configured alias
  otherGuild: "500000000000000007",
};

function makeConfig() {
  return {
    defaultToken: "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX0000",
    global: {
      default_project: "strawn-games",
      projects: {
        "strawn-games": {
          guild_id: GUILD,
          channels: {
            "feed-preview": CH.preview,
            welcome: CH.welcome,
            announcements: CH.announcements,
            videos: CH.videos,
            "build-forum": CH.forum,
          },
          owners: [OWNER],
          personas: {
            strawn: {
              name: "Strawn Games",
              avatar_url: "https://cdn.example.com/strawn.png",
              color: 0x3498db,
              footer: "Strawn Games SMP",
              default_channel: "announcements",
            },
            meelah: { name: "Meelah", default_channel: "welcome" },
            "counting-cubes": { name: "Counting Cubes", default_channel: "videos" },
          },
          posts: {
            approver_user_ids: [APPROVER],
            approver_role_ids: [MOD_ROLE],
          },
        },
      },
    },
    perProject: undefined,
  } as any;
}

interface Sent {
  id: string;
  channelId: string;
  payload: any;
}

function setup() {
  let next = 900000000000000000n;
  const sent: Sent[] = [];
  const messages = new Map<string, any>();
  const memberRoles = new Map<string, string[]>([
    [MOD, [MOD_ROLE]],
    [KID, []],
    [OWNER, []],
    [APPROVER, []],
  ]);
  const channels = new Map<string, any>();

  /** Like MessageManager.fetch: one message by id, or the next `limit` after an id. */
  async function fetchMessages(
    channelId: string,
    arg: string | { message?: string; after?: string; limit?: number },
  ) {
    if (typeof arg === "string" || arg.message) {
      const m = messages.get(typeof arg === "string" ? arg : arg.message!);
      if (!m) throw new Error("Unknown Message");
      return m;
    }
    const after = BigInt(arg.after ?? "0");
    const following = [...messages.values()]
      .filter((m) => m.channelId === channelId && BigInt(m.id) > after)
      .sort((a, b) => (BigInt(a.id) < BigInt(b.id) ? -1 : 1))
      .slice(0, arg.limit ?? 50);
    return new Map(following.map((m) => [m.id, m]));
  }

  function makeThread(id: string, parentId: string | null = null) {
    const thread = {
      id,
      type: 11,
      guildId: GUILD,
      parentId,
      isThread: () => true,
      pin: vi.fn().mockResolvedValue(undefined),
      messages: { fetch: vi.fn((arg: any) => fetchMessages(id, arg)) },
    };
    channels.set(id, thread);
    return thread;
  }

  function makeChannel(id: string) {
    const isForum = id === CH.forum;
    const webhook = {
      id: "888888888888888888",
      name: PERSONA_WEBHOOK_NAME,
      token: "webhook-token",
      owner: { id: BOT_ID },
      channelId: id,
      send: vi.fn(async (payload: any) => {
        const mid = String(next++);
        // A webhook forum post creates a thread that shares the starter message's id.
        const msgChannel = payload.threadName ? makeThread(mid).id : (payload.threadId ?? id);
        // Mirror what Discord stores, so the publish-time preview check can compare.
        const msg = {
          id: mid,
          channelId: msgChannel,
          webhookId: webhook.id,
          author: { username: payload.username },
          editedTimestamp: null as number | null,
          content: (payload.content ?? "").trim(), // Discord trims message content
          embeds: payload.embeds ?? [],
          pin: vi.fn().mockResolvedValue(undefined),
          reactions: { cache: new Map() },
        };
        messages.set(mid, msg);
        sent.push({ id: mid, channelId: msgChannel, payload });
        return msg;
      }),
    };
    return {
      id,
      type: isForum ? 15 : 0,
      guildId: id === CH.otherGuild ? "999999999999999999" : GUILD,
      availableTags: isForum
        ? [
            { id: "910000000000000001", name: "Redstone" },
            { id: "910000000000000002", name: "Castle" },
          ]
        : [],
      webhook,
      threads: {
        create: vi.fn(async (opts: any) => {
          const tid = String(next++);
          const thread = makeThread(tid);
          sent.push({ id: tid, channelId: tid, payload: { ...opts, via: "bot" } });
          return { ...thread, name: opts.name, appliedTags: opts.appliedTags ?? [] };
        }),
      },
      fetchWebhooks: vi.fn(async () => new Map([[webhook.id, webhook]])),
      createWebhook: vi.fn(),
      messages: { fetch: vi.fn((arg: any) => fetchMessages(id, arg)) },
    };
  }

  const guild = {
    members: {
      fetch: vi.fn(async (uid: string) => {
        const roles = memberRoles.get(uid);
        if (!roles) throw new Error("Unknown Member");
        return { roles: { cache: new Set(roles) } };
      }),
    },
  };

  const getAny = async (id: string) => {
    if (!channels.has(id)) channels.set(id, makeChannel(id));
    return channels.get(id);
  };
  const ctx: ToolContext = {
    discord: {
      // Like DiscordClient.getChannel: forum channels are not text-based and are refused.
      getChannel: vi.fn(async (id: string) => {
        const channel = await getAny(id);
        if (channel.type === 15) throw new Error(`Channel ${id} not found or not a text channel`);
        return channel;
      }),
      getAnyChannel: vi.fn(getAny),
      getGuild: vi.fn(async () => guild),
      getClient: vi.fn(async () => ({ user: { id: BOT_ID } })),
      findChannelByName: vi.fn(async () => undefined),
    } as any,
    config: makeConfig(),
  };

  function react(messageId: string, users: Array<{ id: string; bot?: boolean }>, emoji = "✅") {
    const msg = messages.get(messageId);
    msg.reactions.cache.set(emoji, {
      emoji: { name: emoji, toString: () => emoji },
      count: users.length,
      // Normal reactions only; super (burst) reactions come back empty.
      users: {
        fetch: async ({ type }: { type?: number } = {}) =>
          new Map(type === 1 ? [] : users.map((u) => [u.id, u])),
      },
    });
  }

  return { ctx, sent, messages, react, guild, channels, makeThread };
}

function json(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

const welcome = {
  type: "welcome",
  persona: "meelah",
  title: "Welcome to the SMP!",
  body: "Be kind, have fun.",
  pin: true,
};
const status = { type: "server_status", persona: "strawn", state: "up", channel: "announcements" };
const announcement = {
  type: "announcement",
  persona: "strawn",
  title: "Season 2",
  body: "Starts Saturday!",
};

let root: string;
const originalDir = process.env.DISCORD_OPS_POSTS_DIR;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "posts-tools-"));
  process.env.DISCORD_OPS_POSTS_DIR = join(root, "posts");
  mockOg.mockReset();
  mockOg.mockResolvedValue({});
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (originalDir === undefined) delete process.env.DISCORD_OPS_POSTS_DIR;
  else process.env.DISCORD_OPS_POSTS_DIR = originalDir;
});

async function preview(env: ReturnType<typeof setup>, post: unknown) {
  const result = await previewPost.handle({ project: "strawn-games", post }, env.ctx);
  expect(result.isError).toBeUndefined();
  return json(result);
}

async function publish(env: ReturnType<typeof setup>, id: string) {
  return publishPost.handle({ project: "strawn-games", preview_message_id: id }, env.ctx);
}

function setAutoTypes(env: ReturnType<typeof setup>, types: string[]) {
  env.ctx.config.global.projects["strawn-games"].posts.auto_types = types;
}

/** The preview message itself (the header is the message just before it). */
function previewMessage(env: ReturnType<typeof setup>, out: { preview_message_id: string }) {
  return env.sent.find((m) => m.id === out.preview_message_id)!;
}

describe("registration", () => {
  it("registers the five posts tools with correct flags", () => {
    const byName = new Map(allTools.map((t) => [t.name, t]));
    for (const name of ["preview_post", "publish_post", "send_post", "preview_posts"]) {
      expect(byName.get(name)?.category).toBe("posts");
      expect(byName.get(name)?.destructive).toBe(true);
      expect(byName.get(name)?.gatesOwnChannels).toBe(true);
    }
    expect(byName.get("list_posts")?.destructive).toBeUndefined();
  });

  it("adds posts tools to messaging, and list_posts to readonly/monitoring", () => {
    const messaging = PROFILES.messaging as string[];
    for (const name of [
      "preview_post",
      "publish_post",
      "send_post",
      "list_posts",
      "preview_posts",
    ]) {
      expect(messaging).toContain(name);
    }
    expect(PROFILES.readonly).toContain("list_posts");
    expect(PROFILES.monitoring).toContain("list_posts");
    expect(PROFILES.readonly).not.toContain("publish_post");
  });

  it("states that unlisted videos cannot be detected", () => {
    for (const tool of [previewPost, sendPost, previewPosts]) {
      expect(tool.description).toMatch(/CANNOT detect unlisted/);
    }
  });
});

describe("preview_post", () => {
  it("posts a header message, then the exact payload, as the persona, and records it", async () => {
    const env = setup();
    const out = await preview(env, welcome);

    expect(out.needs_approval).toBe(true);
    expect(out.target_channel).toBe("#welcome"); // preset default_channel
    expect(env.sent).toHaveLength(2);
    const [header, body] = env.sent;
    expect(header!.channelId).toBe(CH.preview);
    expect(header!.id).toBe(out.header_message_id);
    expect(header!.payload.content).toBe(
      `PREVIEW → #welcome (<#${CH.welcome}>) · project strawn-games · welcome · will be pinned`,
    );
    expect(body!.id).toBe(out.preview_message_id);
    expect(body!.channelId).toBe(CH.preview);
    expect(body!.payload.content).toBeUndefined();
    expect(body!.payload.username).toBe("Meelah");
    expect(body!.payload.allowedMentions).toEqual({ parse: [] });
    expect(body!.payload.embeds[0].title).toBe("Welcome to the SMP!");

    const ledger = readLedger("strawn-games");
    expect(ledger.records).toHaveLength(1);
    expect(ledger.records[0]).toMatchObject({
      id: out.preview_message_id,
      header_message_id: out.header_message_id,
      status: "pending",
      type: "welcome",
      target_channel_id: CH.welcome,
      payload_sha256: out.payload_sha256,
    });
  });

  it("applies preset avatar, color, and footer", async () => {
    const env = setup();
    const out = await preview(env, announcement);
    const payload = previewMessage(env, out).payload;
    expect(payload.username).toBe("Strawn Games");
    expect(payload.avatarURL).toBe("https://cdn.example.com/strawn.png");
    expect(payload.embeds[0].color).toBe(0x3498db);
    expect(payload.embeds[0].footer).toEqual({ text: "Strawn Games SMP" });
  });

  it("previews a full 2000-character character_line (the header is its own message)", async () => {
    const env = setup();
    const line = "a".repeat(2000);
    const out = await preview(env, { type: "character_line", persona: "meelah", line });
    expect(previewMessage(env, out).payload.content).toBe(line);
  });

  it("refuses a persona that is not a preset", async () => {
    const env = setup();
    const result = await previewPost.handle(
      { project: "strawn-games", post: { ...welcome, persona: "Random Bot" } },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not a persona preset.*strawn, meelah, counting-cubes/);
    expect(env.sent).toHaveLength(0);
  });

  it("refuses a target that is not an exact configured alias", async () => {
    const env = setup();
    const result = await previewPost.handle(
      { project: "strawn-games", post: { ...welcome, channel: "welcom" } },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not a configured channel alias/);
  });

  it("refuses when the preview channel alias is missing", async () => {
    const env = setup();
    env.ctx.config.global.projects["strawn-games"].posts.preview_channel = "nope";
    const result = await previewPost.handle({ project: "strawn-games", post: welcome }, env.ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Preview channel "nope"/);
  });

  it("refuses targeting the preview channel itself", async () => {
    const env = setup();
    const result = await previewPost.handle(
      { project: "strawn-games", post: { ...welcome, channel: "feed-preview" } },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/cannot also be the post's target/);
  });

  it("refuses a post whose project disagrees with the tool's project", async () => {
    const env = setup();
    const result = await previewPost.handle(
      { project: "strawn-games", post: { ...welcome, project: "other" } },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/does not match/);
  });

  describe("channel_id targets", () => {
    it("accepts a channel_id in the project's guild", async () => {
      const env = setup();
      const out = await preview(env, { ...announcement, channel_id: CH.unlisted });
      expect(out.target_channel).toBe(`<#${CH.unlisted}>`);
      expect(env.sent[0]!.payload.content).toContain(`<#${CH.unlisted}>`);
      env.react(out.preview_message_id, [{ id: OWNER }]);
      const result = json(await publish(env, out.preview_message_id));
      expect(result.channel_id).toBe(CH.unlisted);
    });

    it("routes a configured channel_id like its alias, including the override bot's profile", async () => {
      const env = setup();
      const out = await preview(env, { ...announcement, channel_id: CH.welcome });
      expect(out.target_channel).toBe("#welcome");

      env.ctx.config.global.bots = {
        reader: { name: "Reader", token_env: "READER_TOKEN", default_profile: "readonly" },
      };
      env.ctx.config.global.projects["strawn-games"].channels.welcome = {
        id: CH.welcome,
        bot: "reader",
      };
      const result = await previewPost.handle(
        { project: "strawn-games", post: { ...announcement, channel_id: CH.welcome } },
        env.ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/"readonly" profile/);
    });

    it("posts into an existing thread through its parent's persona webhook", async () => {
      const env = setup();
      env.makeThread("500000000000000010", CH.announcements);
      const out = await preview(env, {
        ...announcement,
        channel_id: "500000000000000010",
        pin: true,
      });
      env.react(out.preview_message_id, [{ id: OWNER }]);
      const result = json(await publish(env, out.preview_message_id));
      expect(result.channel_id).toBe("500000000000000010");
      expect(result.pinned).toBe(true);
      const published = env.sent.at(-1)!;
      expect(published.payload.threadId).toBe("500000000000000010");
      const parent = await env.ctx.discord.getAnyChannel(CH.announcements);
      expect((parent as any).webhook.send).toHaveBeenCalledWith(
        expect.objectContaining({ threadId: "500000000000000010" }),
      );
    });

    it("routes a thread under a configured channel through that channel's bot profile", async () => {
      const env = setup();
      env.makeThread("500000000000000011", CH.welcome);
      env.ctx.config.global.bots = {
        reader: { name: "Reader", token_env: "READER_TOKEN", default_profile: "readonly" },
      };
      env.ctx.config.global.projects["strawn-games"].channels.welcome = {
        id: CH.welcome,
        bot: "reader",
      };
      const result = await previewPost.handle(
        { project: "strawn-games", post: { ...announcement, channel_id: "500000000000000011" } },
        env.ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/"readonly" profile/);
    });

    it("discovers a thread visible only to its parent's override bot", async () => {
      const env = setup();
      const thread = env.makeThread("500000000000000012", CH.welcome);
      env.ctx.config.global.bots = {
        writer: { name: "Writer", token_env: "WRITER_TOKEN", default_profile: "messaging" },
      };
      env.ctx.config.global.projects["strawn-games"].channels.welcome = {
        id: CH.welcome,
        bot: "writer",
      };
      const writerToken = "w".repeat(60);
      vi.stubEnv("WRITER_TOKEN", writerToken);
      const getAny = env.ctx.discord.getAnyChannel as any;
      const original = getAny.getMockImplementation();
      getAny.mockImplementation(async (id: string, token?: string) => {
        if (id === thread.id && token !== writerToken) throw new Error("Missing Access");
        return original(id, token);
      });
      try {
        const out = await preview(env, { ...announcement, channel_id: thread.id });
        expect(out.target_channel).toBe(`<#${thread.id}>`);
      } finally {
        vi.unstubAllEnvs();
      }
    });

    it("refuses a channel_id in another guild", async () => {
      const env = setup();
      const result = await previewPost.handle(
        { project: "strawn-games", post: { ...announcement, channel_id: CH.otherGuild } },
        env.ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/not in project "strawn-games"'s guild/);
    });

    it("refuses both channel and channel_id", async () => {
      const env = setup();
      const result = await previewPost.handle(
        {
          project: "strawn-games",
          post: { ...announcement, channel: "announcements", channel_id: CH.unlisted },
        },
        env.ctx,
      );
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/not both/);
    });
  });

  describe("video_upload (YouTube oEmbed mocked)", () => {
    const video = {
      type: "video_upload",
      persona: "strawn",
      url: "https://youtu.be/dQw4w9WgXcQ",
      channel: "videos",
    };

    it("looks up the video id and renders it", async () => {
      const env = setup();
      mockOg.mockResolvedValue({ title: "Our new base", image: "https://i.ytimg.com/vi/x/hq.jpg" });
      const out = await preview(env, video);
      expect(mockOg).toHaveBeenCalledWith("dQw4w9WgXcQ");
      expect(previewMessage(env, out).payload.embeds[0]).toMatchObject({
        title: "Our new base",
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      });
    });

    it.each([
      {},
      { title: "Video unavailable" },
      { error: "YouTube reports the video as private or not embeddable" },
    ])("refuses unavailable video %j", async (og) => {
      const env = setup();
      mockOg.mockResolvedValue(og);
      const result = await previewPost.handle({ project: "strawn-games", post: video }, env.ctx);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/looks unavailable/);
      expect(env.sent).toHaveLength(0);
    });

    it("re-checks availability at publish time", async () => {
      const env = setup();
      mockOg.mockResolvedValue({ title: "Our new base" });
      const out = await preview(env, video);
      env.react(out.preview_message_id, [{ id: OWNER }]);
      mockOg.mockResolvedValue({ title: "Private video" });
      const result = await publish(env, out.preview_message_id);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toMatch(/no longer looks available/);
      expect(env.sent).toHaveLength(2); // header + preview only
    });
  });
});

describe("publish_post approval", () => {
  it("refuses with no reaction, naming who must react on which message", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    const text = result.content[0]!.text;
    expect(text).toMatch(/no ✅ reaction/);
    expect(text).toContain(out.preview_message_id);
    expect(text).toContain(`<@${APPROVER}>`);
    expect(text).toContain(`<@${OWNER}>`);
    expect(text).toContain(`<@&${MOD_ROLE}>`);
    expect(env.sent).toHaveLength(2);
  });

  it("does not count a bot's reaction", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: BOT_ID, bot: true }]);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/bots cannot approve/);
  });

  it("does not count a bot even when its id is listed as an approver", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: APPROVER, bot: true }]);
    expect((await publish(env, out.preview_message_id)).isError).toBe(true);
  });

  it("does not count a non-approver", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: KID }]);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/non-approvers \(700000000000000004\)/);
  });

  it("ignores other emoji, and a ✅ on the header message", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }], "\u{1F44D}");
    env.react(out.header_message_id, [{ id: OWNER }]);
    expect((await publish(env, out.preview_message_id)).isError).toBe(true);
  });

  it("accepts a project owner by user id, publishes, and pins", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: KID }, { id: OWNER }]);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBeUndefined();
    expect(json(result)).toMatchObject({ published: true, approved_by: OWNER, pinned: true });

    const published = env.sent[2]!;
    expect(published.channelId).toBe(CH.welcome);
    expect(published.payload.content).toBeUndefined();
    expect(published.payload.username).toBe("Meelah");
    expect(env.messages.get(published.id).pin).toHaveBeenCalled();

    const ledger = readLedger("strawn-games");
    expect(ledger.records[0]).toMatchObject({
      status: "published",
      approved_by: OWNER,
      published_message_id: published.id,
    });
  });

  it("accepts a configured approver_user_id", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: APPROVER }]);
    expect(json(await publish(env, out.preview_message_id)).approved_by).toBe(APPROVER);
  });

  it("accepts a member holding an approver role", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: MOD }]);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBeUndefined();
    expect(json(result).approved_by).toBe(MOD);
    expect(env.guild.members.fetch).toHaveBeenCalledWith(MOD);
  });

  it("needs a fresh ✅ on every preview of a non-auto type — an earlier approval unlocks nothing", async () => {
    const env = setup();
    const first = await preview(env, welcome);
    env.react(first.preview_message_id, [{ id: OWNER }]);
    expect((await publish(env, first.preview_message_id)).isError).toBeUndefined();

    const second = await preview(env, { ...welcome, title: "Welcome again" });
    expect(second.needs_approval).toBe(true);
    const result = await publish(env, second.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Every "welcome" post needs an approver's/);

    env.react(second.preview_message_id, [{ id: OWNER }]);
    expect((await publish(env, second.preview_message_id)).isError).toBeUndefined();
  });

  it.each([
    "welcome",
    "rules",
    "announcement",
    "server_status",
    "event",
    "schedule_update",
    "build_spotlight",
    "character_line",
    "custom",
  ])("requires a ✅ for a non-auto %s post", async (type) => {
    const env = setup();
    const posts: Record<string, unknown> = {
      welcome,
      rules: { ...welcome, type: "rules" },
      announcement,
      server_status: status,
      event: {
        type: "event",
        persona: "strawn",
        title: "Build contest",
        description: "Build a house",
        starts_at: "2026-12-05T19:00:00-05:00",
      },
      schedule_update: {
        type: "schedule_update",
        persona: "strawn",
        title: "Build night",
        change: "Moves to 7pm",
      },
      build_spotlight: {
        type: "build_spotlight",
        persona: "strawn",
        title: "Sky castle",
        builder: "Sprout",
        image_url: "https://cdn.example.com/b.png",
      },
      character_line: { type: "character_line", persona: "meelah", line: "Hi!" },
      custom: { type: "custom", persona: "strawn", content: "Hello", channel: "announcements" },
    };
    const out = await preview(env, posts[type]);
    expect(out.needs_approval).toBe(true);
    expect((await publish(env, out.preview_message_id)).isError).toBe(true);
  });

  it("publishes an auto type's preview without a reaction", async () => {
    const env = setup();
    setAutoTypes(env, ["server_status"]);
    const out = await preview(env, status);
    expect(out.needs_approval).toBe(false);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBeUndefined();
    expect(json(result).approved_by).toBeNull();
  });

  it("refuses a second publish of the same preview", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    await publish(env, out.preview_message_id);
    const again = await publish(env, out.preview_message_id);
    expect(again.isError).toBe(true);
    expect(again.content[0]!.text).toMatch(/already published/);
    expect(env.sent).toHaveLength(3);
  });

  it("refuses an unknown preview id", async () => {
    const env = setup();
    const result = await publish(env, "123456789012345678");
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/run preview_post first/);
  });
});

describe("send_post", () => {
  it("posts an auto type directly, with no preview or ✅", async () => {
    const env = setup();
    setAutoTypes(env, ["server_status"]);
    const result = await sendPost.handle({ project: "strawn-games", post: status }, env.ctx);
    expect(result.isError).toBeUndefined();
    const data = json(result);
    expect(data.channel_id).toBe(CH.announcements);
    expect(env.sent).toHaveLength(1);
    expect(env.sent[0]!.payload.embeds[0].title).toMatch(/online/);
    expect(readLedger("strawn-games").records[0]).toMatchObject({
      via: "send_post",
      status: "published",
    });
  });

  it("refuses a type that is not in auto_types, pointing to preview_post", async () => {
    const env = setup();
    setAutoTypes(env, ["server_status"]);
    const result = await sendPost.handle({ project: "strawn-games", post: welcome }, env.ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not in posts.auto_types.*preview_post/);
    expect(env.sent).toHaveLength(0);
  });

  it("refuses everything when auto_types is unset", async () => {
    const env = setup();
    const result = await sendPost.handle({ project: "strawn-games", post: status }, env.ctx);
    expect(result.isError).toBe(true);
  });

  it("is not unlocked by an earlier approved publish", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    await publish(env, out.preview_message_id);
    const result = await sendPost.handle({ project: "strawn-games", post: welcome }, env.ctx);
    expect(result.isError).toBe(true);
  });

  it("requires a fresh ✅ to publish Counting Cubes, even with video_upload in auto_types", async () => {
    const env = setup();
    setAutoTypes(env, ["video_upload"]);
    mockOg.mockResolvedValue({ title: "Count with me", author_name: "Counting Cubes" });
    const cc = {
      type: "video_upload",
      persona: "counting-cubes",
      url: "https://youtu.be/dQw4w9WgXcQ",
      confirm_public: true,
    };
    const out = await preview(env, cc);
    expect(out.needs_approval).toBe(true);
    const refused = await publish(env, out.preview_message_id);
    expect(refused.isError).toBe(true);
    expect(refused.content[0]!.text).toMatch(/Every Counting Cubes post needs an approver's/);

    env.react(out.preview_message_id, [{ id: OWNER }]);
    expect((await publish(env, out.preview_message_id)).isError).toBeUndefined();

    // A non-Counting-Cubes video in auto_types still needs no ✅.
    mockOg.mockResolvedValue({ title: "Our base", author_name: "Strawn Games" });
    const plain = await preview(env, { ...cc, persona: "strawn", confirm_public: undefined });
    expect(plain.needs_approval).toBe(false);
  });

  it("never auto-posts Counting Cubes, even with video_upload in auto_types", async () => {
    const env = setup();
    setAutoTypes(env, ["video_upload"]);
    mockOg.mockResolvedValue({ title: "Count with me", author_name: "Counting Cubes" });
    const cc = {
      type: "video_upload",
      persona: "counting-cubes",
      url: "https://youtu.be/dQw4w9WgXcQ",
    };
    const noConfirm = await sendPost.handle({ project: "strawn-games", post: cc }, env.ctx);
    expect(noConfirm.isError).toBe(true);
    expect(noConfirm.content[0]!.text).toMatch(/confirm_public: true/);

    const confirmed = await sendPost.handle(
      { project: "strawn-games", post: { ...cc, confirm_public: true } },
      env.ctx,
    );
    expect(confirmed.isError).toBe(true);
    expect(confirmed.content[0]!.text).toMatch(/Counting Cubes posts always need an approver's ✅/);
  });

  it("pins when pin: true", async () => {
    const env = setup();
    setAutoTypes(env, ["server_status"]);
    const result = json(
      await sendPost.handle({ project: "strawn-games", post: { ...status, pin: true } }, env.ctx),
    );
    expect(result.pinned).toBe(true);
    expect(env.messages.get(result.message_id).pin).toHaveBeenCalled();
  });
});

describe("custom posts", () => {
  const custom = {
    type: "custom",
    persona: "strawn",
    channel: "announcements",
    content: "Hello builders!",
    embeds: [
      { title: "Tonight", description: "Build night", color: 0x00ff00 },
      { title: "Prizes", fields: [{ name: "1st", value: "Diamond block" }] },
    ],
  };

  it("previews and publishes free-form content and embeds with preset defaults", async () => {
    const env = setup();
    const out = await preview(env, custom);
    const body = previewMessage(env, out).payload;
    expect(body.content).toBe("Hello builders!");
    expect(body.embeds[0]).toMatchObject({ color: 0x00ff00, footer: { text: "Strawn Games SMP" } });
    expect(body.embeds[1]).toMatchObject({ color: 0x3498db, footer: { text: "Strawn Games SMP" } });

    env.react(out.preview_message_id, [{ id: OWNER }]);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBeUndefined();
    expect(env.sent.at(-1)!.payload.embeds).toEqual(body.embeds);
  });

  it("refuses a custom post with neither content nor embeds", async () => {
    const env = setup();
    const result = await previewPost.handle(
      {
        project: "strawn-games",
        post: { type: "custom", persona: "strawn", channel: "announcements" },
      },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/needs content, embeds, or both/);
  });

  it.each([
    [{ image: { url: "http://cdn.example.com/a.png" } }, /embeds.0.image.url/],
    [{ url: "https://10.0.0.1/" }, /embeds.0.url/],
    [{ author: { name: "a", icon_url: "https://127.0.0.1/i.png" } }, /author.icon_url/],
  ])("refuses a non-public-https embed URL %j", async (embed, message) => {
    const env = setup();
    const result = await previewPost.handle(
      {
        project: "strawn-games",
        post: { type: "custom", persona: "strawn", channel: "announcements", embeds: [embed] },
      },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(message);
  });
});

describe("forum_post", () => {
  const forumPost = {
    type: "forum_post",
    persona: "meelah",
    channel: "build-forum",
    title: "Show us your castles",
    content: "Post your best castle build here!",
    tags: ["castle"],
  };

  it("previews as a normal persona message, then publishes a forum thread via the webhook", async () => {
    const env = setup();
    const out = await preview(env, forumPost);
    const [header, body] = env.sent;
    expect(header!.payload.content).toBe(
      `PREVIEW → #build-forum (<#${CH.forum}>) · project strawn-games · forum_post · new thread "Show us your castles" · tags: castle`,
    );
    expect(body!.channelId).toBe(CH.preview);
    expect(body!.payload.threadName).toBeUndefined();
    expect(body!.payload.content).toBe("Post your best castle build here!");

    env.react(out.preview_message_id, [{ id: OWNER }]);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBeUndefined();
    const data = json(result);
    expect(data.posted_via).toBe("webhook");
    const published = env.sent.at(-1)!;
    expect(published.payload).toMatchObject({
      threadName: "Show us your castles",
      appliedTags: ["910000000000000002"],
      username: "Meelah",
      content: "Post your best castle build here!",
    });
    expect(data.thread_id).toBe(published.channelId);
  });

  it("falls back to the bot when the webhook forum post is rejected", async () => {
    const env = setup();
    const out = await preview(env, forumPost);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const forum = await env.ctx.discord.getAnyChannel(CH.forum);
    (forum as any).webhook.send.mockRejectedValueOnce(
      Object.assign(new Error("Webhooks cannot post here"), { status: 400 }),
    );
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBeUndefined();
    expect(json(result).posted_via).toBe("bot");
    expect((forum as any).threads.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Show us your castles",
        appliedTags: ["910000000000000002"],
        message: expect.objectContaining({ allowedMentions: { parse: [] } }),
      }),
    );
  });

  it("does not fall back when the webhook outcome is unknown", async () => {
    const env = setup();
    const out = await preview(env, forumPost);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const forum = await env.ctx.discord.getAnyChannel(CH.forum);
    (forum as any).webhook.send.mockRejectedValueOnce(new Error("socket hang up"));
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect((forum as any).threads.create).not.toHaveBeenCalled();
  });

  it("pins the new thread when pin: true", async () => {
    const env = setup();
    const out = await preview(env, { ...forumPost, pin: true });
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const data = json(await publish(env, out.preview_message_id));
    expect(data.pinned).toBe(true);
    const thread = await env.ctx.discord.getAnyChannel(data.thread_id);
    expect((thread as any).pin).toHaveBeenCalled();
  });

  it("refuses an unknown tag at preview, listing the forum's tags", async () => {
    const env = setup();
    const result = await previewPost.handle(
      { project: "strawn-games", post: { ...forumPost, tags: ["nether"] } },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/Tag "nether" not found.*Redstone, Castle/);
    expect(env.sent).toHaveLength(0);
  });

  it("refuses a non-forum target", async () => {
    const env = setup();
    const result = await previewPost.handle(
      { project: "strawn-games", post: { ...forumPost, channel: "announcements" } },
      env.ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not a forum channel/);
  });
});

describe("schedule_update", () => {
  it("previews and publishes a compact amber update, red when cancelled", async () => {
    const env = setup();
    const change = {
      type: "schedule_update",
      persona: "strawn",
      title: "Build night",
      change: "Moves from 6pm to 7pm",
      starts_at: "2026-12-05T19:00:00-05:00",
    };
    const out = await preview(env, change);
    expect(previewMessage(env, out).payload.embeds[0].color).toBe(0xfaa61a);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    expect((await publish(env, out.preview_message_id)).isError).toBeUndefined();

    const cancelled = await preview(env, { ...change, cancelled: true });
    const embed = previewMessage(env, cancelled).payload.embeds[0];
    expect(embed.color).toBe(0xed4245);
    expect(embed.title).toMatch(/Cancelled: Build night/);
  });
});

describe("publish_post payload integrity", () => {
  it("refuses when the preset changed since preview", async () => {
    const env = setup();
    const out = await preview(env, announcement);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    env.ctx.config.global.projects["strawn-games"].personas.strawn.color = 0xff0000;
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/no longer renders to the previewed payload/);
    expect(env.sent).toHaveLength(2);
  });

  it("refuses when channel routing changed since preview", async () => {
    const env = setup();
    const out = await preview(env, announcement);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    env.ctx.config.global.projects["strawn-games"].channels.announcements = "500000000000000009";
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/no longer renders/);
  });

  it("refuses a tampered ledger payload", async () => {
    const env = setup();
    const out = await preview(env, announcement);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const path = ledgerPath("strawn-games");
    const ledger = JSON.parse(readFileSync(path, "utf-8"));
    ledger.records[0].payload.content = "@everyone free robux";
    writeFileSync(path, JSON.stringify(ledger));
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/no longer renders/);
    expect(env.sent).toHaveLength(2);
  });

  it("refuses a tampered ledger post", async () => {
    const env = setup();
    const out = await preview(env, announcement);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const path = ledgerPath("strawn-games");
    const ledger = JSON.parse(readFileSync(path, "utf-8"));
    ledger.records[0].post.body = "something else";
    writeFileSync(path, JSON.stringify(ledger));
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/no longer renders/);
  });

  async function swapRecord(
    env: ReturnType<typeof setup>,
    approvedId: string,
    otherId: string,
  ): Promise<void> {
    const path = ledgerPath("strawn-games");
    const ledger = JSON.parse(readFileSync(path, "utf-8"));
    const approved = ledger.records.find((r: any) => r.id === approvedId);
    const other = ledger.records.find((r: any) => r.id === otherId);
    for (const key of [
      "post",
      "payload",
      "payload_sha256",
      "target_channel",
      "target_channel_id",
    ]) {
      approved[key] = other[key];
    }
    writeFileSync(path, JSON.stringify(ledger));
  }

  it("refuses a consistent rewrite that only changes the target channel", async () => {
    const env = setup();
    const out = await preview(env, announcement);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const other = await preview(env, { ...announcement, channel: "welcome" });
    await swapRecord(env, out.preview_message_id, other.preview_message_id);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/preview header content differs/);
  });

  it("refuses a consistent rewrite that only changes an embed thumbnail", async () => {
    const env = setup();
    const base = { type: "custom", persona: "strawn", channel: "announcements" };
    const out = await preview(env, {
      ...base,
      embeds: [{ title: "Hi", thumbnail: { url: "https://cdn.example.com/a.png" } }],
    });
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const other = await preview(env, {
      ...base,
      embeds: [{ title: "Hi", thumbnail: { url: "https://cdn.example.com/b.png" } }],
    });
    await swapRecord(env, out.preview_message_id, other.preview_message_id);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/preview embeds differ/);
  });

  it("refuses a rewrite that points the approved preview at another preview's header", async () => {
    const env = setup();
    // Identical bodies, different destinations; only the first is approved.
    const out = await preview(env, announcement);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const other = await preview(env, { ...announcement, channel: "welcome" });
    const path = ledgerPath("strawn-games");
    const ledger = JSON.parse(readFileSync(path, "utf-8"));
    const approved = ledger.records.find((r: any) => r.id === out.preview_message_id);
    const swapped = ledger.records.find((r: any) => r.id === other.preview_message_id);
    for (const key of [
      "post",
      "payload",
      "payload_sha256",
      "target_channel",
      "target_channel_id",
      "header_message_id",
    ]) {
      approved[key] = swapped[key];
    }
    writeFileSync(path, JSON.stringify(ledger));
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not the message right before the approved preview/);
    expect(env.sent).toHaveLength(4);
  });

  it("refuses when a message sits between the header and the preview", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    // Simulate an interleaved message by re-pointing the record at an earlier header.
    const first = await preview(env, welcome);
    const path = ledgerPath("strawn-games");
    const ledger = JSON.parse(readFileSync(path, "utf-8"));
    ledger.records.find((r: any) => r.id === first.preview_message_id).header_message_id =
      out.header_message_id;
    writeFileSync(path, JSON.stringify(ledger));
    env.react(first.preview_message_id, [{ id: OWNER }]);
    const result = await publish(env, first.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not the message right before/);
  });

  it("refuses when the header message was deleted or edited", async () => {
    const env = setup();
    const a = await preview(env, welcome);
    env.react(a.preview_message_id, [{ id: OWNER }]);
    env.messages.delete(a.header_message_id);
    const deleted = await publish(env, a.preview_message_id);
    expect(deleted.isError).toBe(true);
    expect(deleted.content[0]!.text).toMatch(/header message is missing/);

    const b = await preview(env, welcome);
    env.react(b.preview_message_id, [{ id: OWNER }]);
    env.messages.get(b.header_message_id).editedTimestamp = Date.now();
    const edited = await publish(env, b.preview_message_id);
    expect(edited.isError).toBe(true);
    expect(edited.content[0]!.text).toMatch(/preview header message was edited/);
  });

  it("refuses a ledger rewritten consistently (post, payload, and hash) after approval", async () => {
    const env = setup();
    const out = await preview(env, announcement);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const other = await preview(env, { ...announcement, body: "Totally different text" });
    const path = ledgerPath("strawn-games");
    const ledger = JSON.parse(readFileSync(path, "utf-8"));
    const approved = ledger.records.find((r: any) => r.id === out.preview_message_id);
    const swapped = ledger.records.find((r: any) => r.id === other.preview_message_id);
    approved.post = swapped.post;
    approved.payload = swapped.payload;
    approved.payload_sha256 = swapped.payload_sha256;
    writeFileSync(path, JSON.stringify(ledger));

    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/preview embeds differ/);
    expect(env.sent).toHaveLength(4); // two headers + two previews
  });
});

describe("publish_post review fixes", () => {
  it("force-fetches the preview so a cached copy without reactions is never used", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    await publish(env, out.preview_message_id);
    const previewChannel = env.channels.get(CH.preview);
    expect(previewChannel.messages.fetch).toHaveBeenCalledWith({
      message: out.preview_message_id,
      force: true,
    });
  });

  it("refuses a deleted preview even for an auto type", async () => {
    const env = setup();
    setAutoTypes(env, ["server_status"]);
    const out = await preview(env, status);
    env.messages.delete(out.preview_message_id);
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/could not be fetched/);
  });

  it("ignores Discord-generated link embeds on the preview", async () => {
    const env = setup();
    const out = await preview(env, {
      type: "character_line",
      persona: "meelah",
      line: "Watch this: https://example.com/video",
    });
    env.messages
      .get(out.preview_message_id)
      .embeds.push({ data: { type: "link" }, title: "Example", url: "https://example.com/video" });
    env.react(out.preview_message_id, [{ id: OWNER }]);
    expect((await publish(env, out.preview_message_id)).isError).toBeUndefined();
  });

  it("refuses a preview whose persona or footer differs from the payload", async () => {
    const env = setup();
    const a = await preview(env, announcement);
    env.react(a.preview_message_id, [{ id: OWNER }]);
    env.messages.get(a.preview_message_id).author = { username: "Meelah" };
    const byName = await publish(env, a.preview_message_id);
    expect(byName.isError).toBe(true);
    expect(byName.content[0]!.text).toMatch(/different persona name/);

    const b = await preview(env, { ...announcement, title: "Other" });
    env.react(b.preview_message_id, [{ id: OWNER }]);
    env.messages.get(b.preview_message_id).embeds[0].footer = { text: "Something else" };
    const byFooter = await publish(env, b.preview_message_id);
    expect(byFooter.isError).toBe(true);
    expect(byFooter.content[0]!.text).toMatch(/preview embeds differ/);
  });

  it("refuses an edited preview", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    env.messages.get(out.preview_message_id).editedTimestamp = Date.now();
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/edited after it was posted/);
  });

  it("refuses a preview posted by a different webhook", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    env.messages.get(out.preview_message_id).webhookId = "999999999999999999";
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not posted by the recorded persona webhook/);
  });

  it("refuses a preview already claimed by another process", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    const path = ledgerPath("strawn-games");
    const ledger = JSON.parse(readFileSync(path, "utf-8"));
    ledger.records[0].status = "publishing";
    ledger.records[0].claimed_at = "2026-11-21T00:00:00.000Z";
    writeFileSync(path, JSON.stringify(ledger));
    const result = await publish(env, out.preview_message_id);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/already being published/);
    expect(env.sent).toHaveLength(2);
  });

  async function failNextTargetSend(env: ReturnType<typeof setup>, err: Error) {
    const target = await env.ctx.discord.getChannel(CH.welcome);
    (target as any).webhook.send.mockRejectedValueOnce(err);
  }

  it("releases the claim when Discord rejects the send (4xx), so a retry works", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    await failNextTargetSend(env, Object.assign(new Error("Invalid Form Body"), { status: 400 }));

    const failed = await publish(env, out.preview_message_id);
    expect(failed.isError).toBe(true);
    expect(failed.content[0]!.text).toMatch(/Invalid Form Body/);
    expect(readLedger("strawn-games").records[0]!.status).toBe("pending");

    const retry = await publish(env, out.preview_message_id);
    expect(retry.isError).toBeUndefined();
    expect(readLedger("strawn-games").records[0]!.status).toBe("published");
  });

  it("keeps the claim when the send outcome is unknown, so a retry cannot double-post", async () => {
    const env = setup();
    const out = await preview(env, welcome);
    env.react(out.preview_message_id, [{ id: OWNER }]);
    await failNextTargetSend(env, new Error("socket hang up"));

    const failed = await publish(env, out.preview_message_id);
    expect(failed.isError).toBe(true);
    expect(failed.content[0]!.text).toMatch(/unknown outcome.*may be live/);
    expect(readLedger("strawn-games").records[0]!.status).toBe("publishing");
    const listed = json(await listPosts.handle({ project: "strawn-games" }, env.ctx));
    expect(listed.publishing).toHaveLength(1);
    expect(listed.publishing[0]).toMatchObject({ id: out.preview_message_id });
    expect(listed.publishing[0].claimed_at).toBeTruthy();

    const retry = await publish(env, out.preview_message_id);
    expect(retry.isError).toBe(true);
    expect(retry.content[0]!.text).toMatch(/already being published/);
  });

  it("publishes an approved preview whose content ends in whitespace", async () => {
    const env = setup();
    const out = await preview(env, {
      type: "character_line",
      persona: "meelah",
      line: "Hi friends!  \n",
    });
    env.react(out.preview_message_id, [{ id: OWNER }]);
    expect((await publish(env, out.preview_message_id)).isError).toBeUndefined();
  });

  it("enforces the profile of a channel's override bot", async () => {
    const env = setup();
    env.ctx.config.global.bots = {
      reader: { name: "Reader", token_env: "READER_TOKEN", default_profile: "readonly" },
    };
    env.ctx.config.global.projects["strawn-games"].channels.welcome = {
      id: CH.welcome,
      bot: "reader",
    };
    const result = await previewPost.handle({ project: "strawn-games", post: welcome }, env.ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toMatch(/not allowed by the "readonly" profile.*"welcome"/);
    expect(env.sent).toHaveLength(0);
  });
});

describe("list_posts", () => {
  it("lists pending and published posts plus approval settings, without payload bodies", async () => {
    const env = setup();
    setAutoTypes(env, ["server_status"]);
    env.ctx.config.global.projects["strawn-games"].posts.require_approval = true;
    const a = await preview(env, welcome);
    env.react(a.preview_message_id, [{ id: OWNER }]);
    await publish(env, a.preview_message_id);
    await preview(env, announcement);

    const data = json(await listPosts.handle({ project: "strawn-games" }, env.ctx));
    expect(data.pending).toHaveLength(1);
    expect(data.pending[0].type).toBe("announcement");
    expect(data.published).toHaveLength(1);
    expect(data.preview_channel).toBe("feed-preview");
    expect(data.auto_types).toEqual(["server_status"]);
    expect(data.require_approval).toBe(true);
    expect(data.approved_types).toBeUndefined();
    expect(data.pending[0].payload).toBeUndefined();
  });

  it("orders published posts by publication time, newest first", async () => {
    const env = setup();
    const older = await preview(env, welcome);
    const newer = await preview(env, { ...welcome, title: "Second" });
    env.react(older.preview_message_id, [{ id: OWNER }]);
    env.react(newer.preview_message_id, [{ id: OWNER }]);
    await publish(env, newer.preview_message_id);
    await new Promise((r) => setTimeout(r, 5));
    await publish(env, older.preview_message_id); // older preview, published last
    const data = json(await listPosts.handle({ project: "strawn-games" }, env.ctx));
    expect(data.published.map((p: any) => p.id)).toEqual([
      older.preview_message_id,
      newer.preview_message_id,
    ]);
  });

  it("errors for an unknown project", async () => {
    const env = setup();
    const result = await listPosts.handle({ project: "nope" }, env.ctx);
    expect(result.isError).toBe(true);
  });
});

describe("preview_posts", () => {
  it("previews each item and continues past item errors", async () => {
    const env = setup();
    const result = await previewPosts.handle(
      {
        project: "strawn-games",
        posts: [
          welcome,
          { type: "build_spotlight", persona: "meelah", title: "t", builder: "b" }, // no image_url
          status,
        ],
      },
      env.ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = json(result);
    expect(data).toMatchObject({ previewed: 2, failed: 1 });
    expect(data.results[1]).toMatchObject({ index: 1, ok: false });
    expect(data.results[1].error).toMatch(/image_url/);
    expect(readLedger("strawn-games").records).toHaveLength(2);
  });

  it("is an error when every item fails", async () => {
    const env = setup();
    const result = await previewPosts.handle(
      { project: "strawn-games", posts: [{ type: "nope" }] },
      env.ctx,
    );
    expect(result.isError).toBe(true);
  });
});
