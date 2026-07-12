import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { leaveNote } from "../../src/tools/notes/leave-note.js";
import { getNotes } from "../../src/tools/notes/get-notes.js";
import { resolveNote } from "../../src/tools/notes/resolve-note.js";
import { listSessions } from "../../src/tools/notes/list-sessions.js";
import {
  encodeNote,
  parseNoteContent,
  resolveBoardChannel,
  defaultSessionId,
  RESOLVED_EMOJI,
} from "../../src/tools/notes/board.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockMessage,
  createMockChannel,
} from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

/** A board message carrying an encoded note, with reactions for resolved state. */
function noteMessage(
  id: string,
  opts: { to: string; from: string; tags?: string[]; body: string; resolved?: boolean },
) {
  const content = encodeNote({
    to: opts.to,
    from: opts.from,
    tags: opts.tags ?? [],
    body: opts.body,
  });
  const reactions = opts.resolved
    ? { cache: [{ emoji: { name: RESOLVED_EMOJI, toString: () => RESOLVED_EMOJI }, count: 1 }] }
    : { cache: [] };
  // Derive an ordered but valid Date from the last digits of the id.
  const createdAt = new Date(1_700_000_000_000 + Number(id.slice(-4)));
  return createMockMessage({ id, content, reactions, createdAt });
}

describe("notes board helpers", () => {
  it("round-trips a note through encode/parse", () => {
    const encoded = encodeNote({
      to: "builder",
      from: "web-a1",
      tags: ["x", "y"],
      body: "hello\nworld",
    });
    const parsed = parseNoteContent(encoded);
    expect(parsed).toEqual({
      to: "builder",
      from: "web-a1",
      tags: ["x", "y"],
      body: "hello\nworld",
    });
  });

  it("parses a note with no tags", () => {
    const parsed = parseNoteContent(
      encodeNote({ to: "all", from: "web-a1", tags: [], body: "hi" }),
    );
    expect(parsed).toEqual({ to: "all", from: "web-a1", tags: [], body: "hi" });
  });

  it("returns undefined for non-note content", () => {
    expect(parseNoteContent("just a normal human message")).toBeUndefined();
    expect(parseNoteContent("")).toBeUndefined();
  });

  it("resolves the board channel via fallback to default_channel", () => {
    const result = resolveBoardChannel("test-project", createMockConfig());
    // test-project has no board_channel / board / agent-logs / backchannel → default_channel
    expect(result).toEqual({ project: "test-project", board: "dev" });
  });

  it("prefers an explicit board_channel", () => {
    const config = createMockConfig();
    (config.global.projects as any)["test-project"].board_channel = "alerts";
    expect(resolveBoardChannel("test-project", config)).toEqual({
      project: "test-project",
      board: "alerts",
    });
  });

  it("errors on an unknown project", () => {
    const result = resolveBoardChannel("ghost", createMockConfig());
    expect("error" in result).toBe(true);
  });

  it("honors DISCORD_OPS_SESSION for the default session id", () => {
    const prev = process.env.DISCORD_OPS_SESSION;
    process.env.DISCORD_OPS_SESSION = "explicit-session";
    expect(defaultSessionId()).toBe("explicit-session");
    if (prev === undefined) delete process.env.DISCORD_OPS_SESSION;
    else process.env.DISCORD_OPS_SESSION = prev;
  });
});

describe("leave_note", () => {
  it("posts an encoded note and returns structured fields", async () => {
    const send = vi.fn().mockResolvedValue(createMockMessage({ id: "900000000000000001" }));
    const channel = createMockChannel({ send });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await leaveNote.handle(
      {
        project: "test-project",
        to: "builder",
        from: "web-a1",
        tags: ["handoff"],
        body: "take the refactor",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.to).toBe("builder");
    expect(data.from).toBe("web-a1");
    expect(data.message_id).toBe("900000000000000001");

    const sentContent = send.mock.calls[0][0].content as string;
    expect(parseNoteContent(sentContent)).toEqual({
      to: "builder",
      from: "web-a1",
      tags: ["handoff"],
      body: "take the refactor",
    });
  });

  it("defaults to a broadcast (to: all)", () => {
    const parsed = leaveNote.inputSchema.parse({
      project: "test-project",
      body: "hi",
      from: "web-a1",
    });
    expect(parsed.to).toBe("all");
  });

  it("rejects whitespace in recipient/session/tag tokens", () => {
    expect(leaveNote.inputSchema.safeParse({ body: "x", to: "two words" }).success).toBe(false);
    expect(leaveNote.inputSchema.safeParse({ body: "x", from: "a b" }).success).toBe(false);
  });
});

describe("get_notes", () => {
  function boardChannel() {
    const messages = new Map([
      [
        "300000000000000004",
        noteMessage("300000000000000004", { to: "all", from: "web-b2", body: "broadcast" }),
      ],
      [
        "300000000000000003",
        createMockMessage({ id: "300000000000000003", content: "human chatter, not a note" }),
      ],
      [
        "300000000000000002",
        noteMessage("300000000000000002", {
          to: "web-a1",
          from: "web-b2",
          tags: ["auth"],
          body: "for A",
          resolved: true,
        }),
      ],
      [
        "300000000000000001",
        noteMessage("300000000000000001", {
          to: "web-a1",
          from: "web-b2",
          tags: ["auth"],
          body: "also for A",
        }),
      ],
    ]);
    const fetch = vi.fn().mockResolvedValue(messages);
    return { channel: createMockChannel({ messages: { fetch } }), fetch };
  }

  it("returns notes addressed to the recipient plus broadcasts, skipping human messages", async () => {
    const { channel } = boardChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getNotes.handle({ project: "test-project", to: "web-a1" }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    // 3 notes total: two to web-a1, one broadcast; the human message is skipped.
    expect(data.count).toBe(3);
    const ids = data.notes.map((n: { id: string }) => n.id);
    expect(ids).not.toContain("300000000000000003");
    // Oldest-first
    expect(ids[0]).toBe("300000000000000001");
  });

  it("filters to unresolved notes", async () => {
    const { channel } = boardChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await getNotes.handle(
      { project: "test-project", to: "web-a1", unresolved: true },
      ctx,
    );
    const data = JSON.parse(result.content[0]!.text);
    const ids = data.notes.map((n: { id: string }) => n.id);
    // The resolved note (…0002) is excluded.
    expect(ids).not.toContain("300000000000000002");
    expect(ids).toContain("300000000000000001");
  });

  it("filters by tag and sender", async () => {
    const { channel } = boardChannel();
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const byTag = JSON.parse(
      (await getNotes.handle({ project: "test-project", tag: "auth" }, ctx)).content[0]!.text,
    );
    expect(byTag.notes.every((n: { tags: string[] }) => n.tags.includes("auth"))).toBe(true);

    const byFrom = JSON.parse(
      (await getNotes.handle({ project: "test-project", from: "web-b2" }, ctx)).content[0]!.text,
    );
    expect(byFrom.notes.every((n: { from: string }) => n.from === "web-b2")).toBe(true);
  });
});

describe("resolve_note", () => {
  it("reacts with the resolved emoji and posts a linked reply", async () => {
    const note = noteMessage("300000000000000001", { to: "web-a1", from: "web-b2", body: "for A" });
    const react = note.react as ReturnType<typeof vi.fn>;
    const send = vi.fn().mockResolvedValue(createMockMessage({ id: "900000000000000009" }));
    const channel = createMockChannel({
      messages: { fetch: vi.fn().mockResolvedValue(note) },
      send,
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await resolveNote.handle(
      { project: "test-project", note_id: "300000000000000001", from: "web-a1", reply: "done" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(react).toHaveBeenCalledWith(RESOLVED_EMOJI);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.resolved).toBe(true);
    expect(data.reply_id).toBe("900000000000000009");
    // Reply is addressed back to the original sender.
    const replyContent = send.mock.calls[0][0].content as string;
    expect(parseNoteContent(replyContent)!.to).toBe("web-b2");
  });

  it("errors cleanly on a missing note", async () => {
    const channel = createMockChannel({
      messages: {
        fetch: vi
          .fn()
          .mockRejectedValue(Object.assign(new Error("Unknown Message"), { code: 10008 })),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await resolveNote.handle(
      { project: "test-project", note_id: "300000000000000009" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not found");
  });
});

describe("list_sessions", () => {
  let now: number;
  beforeEach(() => {
    now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);
  });
  afterEach(() => vi.restoreAllMocks());

  it("derives active/idle sessions from note authorship within the window", async () => {
    const recent = createMockMessage({
      id: "300000000000000002",
      content: encodeNote({ to: "all", from: "web-recent", tags: [], body: "hi" }),
      createdAt: new Date(now - 5 * 60_000),
    });
    const stale = createMockMessage({
      id: "300000000000000001",
      content: encodeNote({ to: "all", from: "web-stale", tags: [], body: "old" }),
      createdAt: new Date(now - 120 * 60_000),
    });
    const channel = createMockChannel({
      messages: {
        fetch: vi.fn().mockResolvedValue(
          new Map([
            ["2", recent],
            ["1", stale],
          ]),
        ),
      },
    });
    const ctx = createCtx();
    (ctx.discord.getChannel as any).mockResolvedValue(channel);

    const result = await listSessions.handle({ project: "test-project", within_minutes: 60 }, ctx);
    const data = JSON.parse(result.content[0]!.text);
    expect(data.active_count).toBe(1);
    const recentSession = data.sessions.find(
      (s: { session: string }) => s.session === "web-recent",
    );
    const staleSession = data.sessions.find((s: { session: string }) => s.session === "web-stale");
    expect(recentSession.active).toBe(true);
    expect(staleSession.active).toBe(false);
  });
});
