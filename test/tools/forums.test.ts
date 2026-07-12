import { describe, it, expect, vi } from "vitest";
import { createForumPost } from "../../src/tools/forums/create-forum-post.js";
import { listForumPosts } from "../../src/tools/forums/list-forum-posts.js";
import { updateForumPost } from "../../src/tools/forums/update-forum-post.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

const FORUM_CHANNEL = "222222222222222222";
const POST_THREAD = "555555555555555555";
const TAG_TODO = "800000000000000001";
const TAG_IN_PROGRESS = "800000000000000002";
const TAG_DONE = "800000000000000003";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

function createMockForumThread(overrides: Record<string, unknown> = {}) {
  return {
    id: POST_THREAD,
    name: "Task: triage flaky test",
    parentId: FORUM_CHANNEL,
    appliedTags: [TAG_TODO],
    archived: false,
    messageCount: 1,
    createdAt: new Date("2026-02-01T00:00:00Z"),
    isThread: () => true,
    setAppliedTags: vi.fn().mockResolvedValue(undefined),
    setArchived: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockForumChannel(overrides: Record<string, unknown> = {}) {
  return {
    id: FORUM_CHANNEL,
    name: "work-queue",
    type: 15, // GuildForum
    guildId: "444444444444444444",
    availableTags: [
      { id: TAG_TODO, name: "todo", moderated: false, emoji: null },
      { id: TAG_IN_PROGRESS, name: "in-progress", moderated: false, emoji: null },
      { id: TAG_DONE, name: "done", moderated: false, emoji: null },
    ],
    threads: {
      create: vi.fn().mockImplementation(async (opts: Record<string, unknown>) =>
        createMockForumThread({
          name: opts.name,
          appliedTags: opts.appliedTags ?? [],
        }),
      ),
      fetchActive: vi.fn().mockResolvedValue({ threads: new Map() }),
      fetchArchived: vi.fn().mockResolvedValue({ threads: new Map() }),
    },
    ...overrides,
  };
}

function createForumCtx(forumOverrides: Record<string, unknown> = {}) {
  const ctx = createCtx();
  const forum = createMockForumChannel(forumOverrides);
  (ctx.discord.getAnyChannel as any).mockResolvedValue(forum);
  return { ctx, forum };
}

// --- create_forum_post ---

describe("create_forum_post", () => {
  it("has correct metadata", () => {
    expect(createForumPost.name).toBe("create_forum_post");
    expect(createForumPost.category).toBe("forums");
    expect(createForumPost.permissions).toEqual(["SendMessages"]);
  });

  it("creates a post and returns thread_id/message_id/title/applied_tags", async () => {
    const { ctx, forum } = createForumCtx();
    const result = await createForumPost.handle(
      {
        channel_id: FORUM_CHANNEL,
        title: "Task: triage flaky test",
        content: "vitest run intermittently fails on threads.test.ts",
        tags: ["todo"],
        auto_archive_duration: "1440",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(forum.threads.create).toHaveBeenCalledWith({
      name: "Task: triage flaky test",
      autoArchiveDuration: 1440,
      message: { content: "vitest run intermittently fails on threads.test.ts" },
      appliedTags: [TAG_TODO],
    });

    const data = JSON.parse(result.content[0]!.text);
    expect(data.thread_id).toBe(POST_THREAD);
    // Forum starter message shares the thread's ID
    expect(data.message_id).toBe(POST_THREAD);
    expect(data.title).toBe("Task: triage flaky test");
    expect(data.applied_tags).toEqual(["todo"]);
  });

  it("creates a post without tags when tags are omitted", async () => {
    const { ctx, forum } = createForumCtx();
    const result = await createForumPost.handle(
      { channel_id: FORUM_CHANNEL, title: "Untagged", content: "No labels yet" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const createArgs = (forum.threads.create as any).mock.calls[0][0];
    expect(createArgs.appliedTags).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.applied_tags).toEqual([]);
  });

  it("resolves multiple tag names case-insensitively", async () => {
    const { ctx, forum } = createForumCtx();
    const result = await createForumPost.handle(
      {
        channel_id: FORUM_CHANNEL,
        title: "Case test",
        content: "body",
        tags: ["TODO", "In-Progress"],
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const createArgs = (forum.threads.create as any).mock.calls[0][0];
    expect(createArgs.appliedTags).toEqual([TAG_TODO, TAG_IN_PROGRESS]);
  });

  it("errors on an unknown tag, listing the available tag names", async () => {
    const { ctx, forum } = createForumCtx();
    const result = await createForumPost.handle(
      { channel_id: FORUM_CHANNEL, title: "Bad tag", content: "body", tags: ["blocked"] },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Tag "blocked" not found');
    expect(result.content[0]!.text).toContain("todo, in-progress, done");
    expect(forum.threads.create).not.toHaveBeenCalled();
  });

  it("errors when the channel is not a forum, naming the actual type", async () => {
    const { ctx } = createForumCtx({ type: 0 }); // GuildText
    const result = await createForumPost.handle(
      { channel_id: FORUM_CHANNEL, title: "Wrong channel", content: "body" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not a forum channel");
    expect(result.content[0]!.text).toContain("GuildText");
  });

  it("errors when routing cannot resolve a channel", async () => {
    const { ctx } = createForumCtx();
    ctx.config.global.default_project = undefined;
    ctx.config.global.projects = {};
    const result = await createForumPost.handle({ title: "No route", content: "body" }, ctx);
    expect(result.isError).toBe(true);
  });

  it("validates title and content bounds via schema", () => {
    expect(
      createForumPost.inputSchema.safeParse({
        title: "a".repeat(101),
        content: "body",
        channel_id: FORUM_CHANNEL,
      }).success,
    ).toBe(false);
    expect(
      createForumPost.inputSchema.safeParse({
        title: "ok",
        content: "",
        channel_id: FORUM_CHANNEL,
      }).success,
    ).toBe(false);
    expect(
      createForumPost.inputSchema.safeParse({
        title: "ok",
        content: "body",
        channel_id: FORUM_CHANNEL,
        tags: ["a", "b", "c", "d", "e", "f"],
      }).success,
    ).toBe(false);
  });

  it("defaults auto_archive_duration to 1440 via schema", () => {
    const parsed = createForumPost.inputSchema.safeParse({
      title: "ok",
      content: "body",
      channel_id: FORUM_CHANNEL,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.auto_archive_duration).toBe("1440");
  });
});

// --- list_forum_posts ---

describe("list_forum_posts", () => {
  function withPosts(active: unknown[], archived: unknown[] = []) {
    const activeMap = new Map(active.map((t: any) => [t.id, t]));
    const archivedMap = new Map(archived.map((t: any) => [t.id, t]));
    return createForumCtx({
      threads: {
        create: vi.fn(),
        fetchActive: vi.fn().mockResolvedValue({ threads: activeMap }),
        fetchArchived: vi.fn().mockResolvedValue({ threads: archivedMap }),
      },
    });
  }

  it("has correct metadata", () => {
    expect(listForumPosts.name).toBe("list_forum_posts");
    expect(listForumPosts.category).toBe("forums");
  });

  it("lists active posts with tag ids mapped back to names", async () => {
    const { ctx } = withPosts([
      createMockForumThread({ appliedTags: [TAG_TODO, TAG_IN_PROGRESS] }),
    ]);
    const result = await listForumPosts.handle({ channel_id: FORUM_CHANNEL }, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.channel_id).toBe(FORUM_CHANNEL);
    expect(data.count).toBe(1);
    expect(data.posts[0]).toEqual({
      thread_id: POST_THREAD,
      title: "Task: triage flaky test",
      tags: ["todo", "in-progress"],
      archived: false,
      message_count: 1,
      created_at: "2026-02-01T00:00:00.000Z",
    });
  });

  it("excludes archived posts by default", async () => {
    const { ctx, forum } = withPosts(
      [createMockForumThread()],
      [createMockForumThread({ id: "556666666666666666", archived: true })],
    );
    const result = await listForumPosts.handle({ channel_id: FORUM_CHANNEL }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(1);
    expect((forum.threads as any).fetchArchived).not.toHaveBeenCalled();
  });

  it("includes archived posts when include_archived is true, deduplicating", async () => {
    const activePost = createMockForumThread();
    const { ctx } = withPosts(
      [activePost],
      [
        activePost, // duplicate — must not appear twice
        createMockForumThread({
          id: "556666666666666666",
          name: "Done task",
          appliedTags: [TAG_DONE],
          archived: true,
        }),
      ],
    );
    const result = await listForumPosts.handle(
      { channel_id: FORUM_CHANNEL, include_archived: true },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(2);
    expect(data.posts.map((p: any) => p.thread_id)).toEqual([POST_THREAD, "556666666666666666"]);
    expect(data.posts[1].archived).toBe(true);
    expect(data.posts[1].tags).toEqual(["done"]);
  });

  it("filters posts by tag name", async () => {
    const { ctx } = withPosts([
      createMockForumThread({ id: "551111111111111111", appliedTags: [TAG_TODO] }),
      createMockForumThread({ id: "552222222222222222", appliedTags: [TAG_IN_PROGRESS] }),
    ]);
    const result = await listForumPosts.handle(
      { channel_id: FORUM_CHANNEL, tag: "in-progress" },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    expect(data.count).toBe(1);
    expect(data.posts[0].thread_id).toBe("552222222222222222");
  });

  it("errors on an unknown tag filter instead of returning an empty list", async () => {
    const { ctx } = withPosts([createMockForumThread()]);
    const result = await listForumPosts.handle(
      { channel_id: FORUM_CHANNEL, tag: "nonexistent" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Tag "nonexistent" not found');
    expect(result.content[0]!.text).toContain("todo, in-progress, done");
  });

  it("errors when the channel is not a forum", async () => {
    const { ctx } = createForumCtx({ type: 2 }); // GuildVoice
    const result = await listForumPosts.handle({ channel_id: FORUM_CHANNEL }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not a forum channel");
    expect(result.content[0]!.text).toContain("GuildVoice");
  });

  it("defaults include_archived to false via schema", () => {
    const parsed = listForumPosts.inputSchema.safeParse({ channel_id: FORUM_CHANNEL });
    expect(parsed.success).toBe(true);
    expect(parsed.data?.include_archived).toBe(false);
  });
});

// --- update_forum_post ---

describe("update_forum_post", () => {
  function createUpdateCtx(threadOverrides: Record<string, unknown> = {}) {
    const ctx = createCtx();
    const forum = createMockForumChannel();
    const thread = createMockForumThread({ parent: forum, ...threadOverrides });
    (ctx.discord.getAnyChannel as any).mockImplementation(async (id: string) =>
      id === POST_THREAD ? thread : forum,
    );
    return { ctx, thread, forum };
  }

  it("has correct metadata", () => {
    expect(updateForumPost.name).toBe("update_forum_post");
    expect(updateForumPost.category).toBe("forums");
    expect(updateForumPost.permissions).toEqual(["ManageThreads"]);
  });

  it("claims a task by replacing tags by name", async () => {
    const { ctx, thread } = createUpdateCtx();
    const result = await updateForumPost.handle(
      { thread_id: POST_THREAD, tags: ["in-progress"] },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(thread.setAppliedTags).toHaveBeenCalledWith([TAG_IN_PROGRESS]);
    expect(thread.setArchived).not.toHaveBeenCalled();

    const data = JSON.parse(result.content[0]!.text);
    expect(data.thread_id).toBe(POST_THREAD);
    expect(data.tags).toEqual(["in-progress"]);
    expect(data.archived).toBe(false);
  });

  it("completes a task by archiving it", async () => {
    const { ctx, thread } = createUpdateCtx();
    const result = await updateForumPost.handle(
      { thread_id: POST_THREAD, tags: ["done"], archived: true },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(thread.setAppliedTags).toHaveBeenCalledWith([TAG_DONE]);
    expect(thread.setArchived).toHaveBeenCalledWith(true);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.tags).toEqual(["done"]);
    expect(data.archived).toBe(true);
  });

  it("unarchives before retagging when reopening an archived post", async () => {
    const { ctx, thread } = createUpdateCtx({ archived: true });
    const callOrder: string[] = [];
    (thread.setArchived as any).mockImplementation(async (v: boolean) => {
      callOrder.push(`setArchived:${v}`);
    });
    (thread.setAppliedTags as any).mockImplementation(async () => {
      callOrder.push("setAppliedTags");
    });

    const result = await updateForumPost.handle(
      { thread_id: POST_THREAD, tags: ["todo"], archived: false },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(callOrder).toEqual(["setArchived:false", "setAppliedTags"]);

    const data = JSON.parse(result.content[0]!.text);
    expect(data.archived).toBe(false);
  });

  it("does not call setArchived(false) when the post is already active", async () => {
    const { ctx, thread } = createUpdateCtx({ archived: false });
    await updateForumPost.handle({ thread_id: POST_THREAD, archived: false }, ctx);
    expect(thread.setArchived).not.toHaveBeenCalled();
  });

  it("errors when neither tags nor archived is provided", async () => {
    const { ctx, thread } = createUpdateCtx();
    const result = await updateForumPost.handle({ thread_id: POST_THREAD }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("Nothing to update");
    expect(thread.setAppliedTags).not.toHaveBeenCalled();
  });

  it("errors on an unknown tag, listing available names, without mutating", async () => {
    const { ctx, thread } = createUpdateCtx();
    const result = await updateForumPost.handle(
      { thread_id: POST_THREAD, tags: ["wontfix"], archived: true },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('Tag "wontfix" not found');
    expect(result.content[0]!.text).toContain("todo, in-progress, done");
    expect(thread.setAppliedTags).not.toHaveBeenCalled();
    expect(thread.setArchived).not.toHaveBeenCalled();
  });

  it("errors when the target is not a thread", async () => {
    const ctx = createCtx();
    (ctx.discord.getAnyChannel as any).mockResolvedValue(createMockForumChannel());
    const result = await updateForumPost.handle({ thread_id: POST_THREAD, archived: true }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("is not a thread");
  });

  it("errors when the thread's parent is not a forum channel", async () => {
    const { ctx } = createUpdateCtx({
      parent: { id: FORUM_CHANNEL, type: 0, availableTags: [] },
    });
    const result = await updateForumPost.handle({ thread_id: POST_THREAD, archived: true }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not a forum post");
    expect(result.content[0]!.text).toContain("GuildText");
  });

  it("fetches the parent forum by parentId when the cached parent is missing", async () => {
    const { ctx, thread, forum } = createUpdateCtx({ parent: null });
    const result = await updateForumPost.handle({ thread_id: POST_THREAD, tags: ["done"] }, ctx);
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getAnyChannel).toHaveBeenCalledWith(FORUM_CHANNEL, undefined);
    expect(thread.setAppliedTags).toHaveBeenCalledWith([TAG_DONE]);
    void forum;
  });

  it("validates thread_id as a snowflake via schema", () => {
    expect(updateForumPost.inputSchema.safeParse({ thread_id: "abc" }).success).toBe(false);
    expect(
      updateForumPost.inputSchema.safeParse({ thread_id: POST_THREAD, archived: true }).success,
    ).toBe(true);
  });
});
