import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getEvents } from "../../src/tools/system/get-events.js";
import { rotatedPath, type SinkEvent } from "../../src/utils/event-sink.js";

let dir: string;
let sink: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "discord-ops-get-events-"));
  sink = join(dir, "events.jsonl");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function createCtx() {
  return {
    discord: {} as any,
    config: {
      defaultToken: "placeholder-default-token",
      global: {
        projects: {},
        listen: {
          sink,
          events: ["message_create", "reaction_add"],
          retention_hours: 72,
        },
      },
    } as any,
  };
}

function ev(seq: number, overrides: Partial<SinkEvent> = {}): SinkEvent {
  return {
    seq,
    type: "message_create",
    project: "alpha",
    channel: "dev",
    channel_id: "111111111111111111",
    guild_id: "900000000000000001",
    message_id: `50000000000000${String(seq).padStart(4, "0")}`,
    author: "AgentBot#0001",
    author_bot: true,
    content: `event ${seq}`,
    reply_to: null,
    ts: "2026-07-12T10:00:00.000Z",
    ...overrides,
  };
}

function writeEvents(path: string, events: SinkEvent[]): void {
  writeFileSync(path, events.map((e) => JSON.stringify(e)).join("\n") + "\n");
}

function parse(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0].text);
}

describe("get_events", () => {
  it("has correct metadata and an honest description", () => {
    expect(getEvents.name).toBe("get_events");
    expect(getEvents.category).toBe("system");
    expect(getEvents.description).toContain("discord-ops listen");
    expect(getEvents.description).toContain("zero Discord API calls");
    expect(getEvents.description).toContain("not the source of truth");
    expect(getEvents.description).toContain("get_messages");
  });

  it("refuses a sink that is a symlink (no arbitrary-file read)", async () => {
    const secret = join(dir, "secret.txt");
    writeFileSync(secret, "SENSITIVE\n");
    symlinkSync(secret, sink);
    const result = await getEvents.handle({ limit: 50 }, createCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/symlink/i);
  });

  it("refuses a sink path with parent traversal", async () => {
    const ctx = createCtx();
    // A literal ".." segment in the configured path (join() would normalize
    // it away, so build the string directly).
    ctx.config.global.listen.sink = `${dir}/../escape.jsonl`;
    const result = await getEvents.handle({ limit: 50 }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/traversal/i);
  });

  it("reports sink_active false with an empty feed when the sink is missing", async () => {
    const result = await getEvents.handle({ limit: 50 }, createCtx());

    expect(result.isError).toBeFalsy();
    const data = parse(result);
    expect(data.sink_active).toBe(false);
    expect(data.events).toEqual([]);
    expect(data.scanned).toBe(0);
    expect(data.last_seq).toBeNull();
  });

  it("reports sink_active false when the sink has not been written in over 5 minutes", async () => {
    writeEvents(sink, [ev(1)]);
    const stale = new Date(Date.now() - 6 * 60 * 1000);
    utimesSync(sink, stale, stale);

    const data = parse(await getEvents.handle({ limit: 50 }, createCtx()));
    expect(data.sink_active).toBe(false);
    // Events are still readable — agents just know the feed is not live.
    expect(data.events).toHaveLength(1);
  });

  it("reports sink_active true for a recently written sink", async () => {
    writeEvents(sink, [ev(1)]);

    const data = parse(await getEvents.handle({ limit: 50 }, createCtx()));
    expect(data.sink_active).toBe(true);
  });

  it("walks forward from the after cursor, oldest-first", async () => {
    writeEvents(
      sink,
      Array.from({ length: 10 }, (_, i) => ev(i + 1)),
    );

    const data = parse(await getEvents.handle({ after: 4, limit: 50 }, createCtx()));
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([5, 6, 7, 8, 9, 10]);
    expect(data.scanned).toBe(6);
    expect(data.last_seq).toBe(10);
  });

  it("stops at limit and returns a gap-free resume cursor", async () => {
    writeEvents(
      sink,
      Array.from({ length: 10 }, (_, i) => ev(i + 1)),
    );

    const first = parse(await getEvents.handle({ after: 0, limit: 3 }, createCtx()));
    expect(first.events.map((e: SinkEvent) => e.seq)).toEqual([1, 2, 3]);
    expect(first.last_seq).toBe(3);

    const second = parse(await getEvents.handle({ after: first.last_seq, limit: 3 }, createCtx()));
    expect(second.events.map((e: SinkEvent) => e.seq)).toEqual([4, 5, 6]);
  });

  it("accepts the after cursor as a string", async () => {
    writeEvents(
      sink,
      Array.from({ length: 5 }, (_, i) => ev(i + 1)),
    );

    const data = parse(await getEvents.handle({ after: "3", limit: 50 }, createCtx()));
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([4, 5]);
  });

  it("rejects a non-numeric after cursor", async () => {
    const result = await getEvents.handle({ after: "not-a-seq", limit: 50 }, createCtx());
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Invalid after cursor");
  });

  it("filters by type without breaking cursor semantics", async () => {
    writeEvents(
      sink,
      Array.from({ length: 6 }, (_, i) =>
        ev(i + 1, (i + 1) % 2 === 0 ? { type: "reaction_add", emoji: "✅" } : {}),
      ),
    );

    const data = parse(
      await getEvents.handle({ after: 0, types: ["reaction_add"], limit: 2 }, createCtx()),
    );
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([2, 4]);
    // The cursor points at the last scanned line, so seq 5-6 are not skipped.
    expect(data.last_seq).toBe(4);
    expect(data.scanned).toBe(4);
  });

  it("filters by project, channel alias, and channel_id", async () => {
    writeEvents(sink, [
      ev(1),
      ev(2, { project: "beta", channel: "ops", channel_id: "333333333333333333" }),
      ev(3),
      ev(4, { project: "alpha", channel: "builds", channel_id: "222222222222222222" }),
    ]);
    const ctx = createCtx();

    const byProject = parse(await getEvents.handle({ after: 0, project: "beta", limit: 50 }, ctx));
    expect(byProject.events.map((e: SinkEvent) => e.seq)).toEqual([2]);

    const byAlias = parse(
      await getEvents.handle({ after: 0, project: "alpha", channel: "dev", limit: 50 }, ctx),
    );
    expect(byAlias.events.map((e: SinkEvent) => e.seq)).toEqual([1, 3]);

    const byId = parse(
      await getEvents.handle({ after: 0, channel_id: "222222222222222222", limit: 50 }, ctx),
    );
    expect(byId.events.map((e: SinkEvent) => e.seq)).toEqual([4]);
  });

  it("returns the newest events when called without a cursor (tail mode)", async () => {
    writeEvents(
      sink,
      Array.from({ length: 10 }, (_, i) => ev(i + 1)),
    );

    const data = parse(await getEvents.handle({ limit: 3 }, createCtx()));
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([8, 9, 10]);
    expect(data.last_seq).toBe(10);
    expect(data.scanned).toBe(10);
  });

  it("tail mode does not replay the rotated file when the active sink has events", async () => {
    // A no-cursor read returns the NEWEST events (active sink) and must not
    // prepend the older rotated file, which would replay stale events.
    writeEvents(
      rotatedPath(sink),
      Array.from({ length: 5 }, (_, i) => ev(i + 1)),
    );
    writeEvents(sink, [ev(6), ev(7), ev(8)]);

    const data = parse(await getEvents.handle({ limit: 50 }, createCtx()));
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([6, 7, 8]);
    expect(data.scanned).toBe(3);
  });

  it("tail mode falls back to the rotated file only when the active sink is empty", async () => {
    writeEvents(
      rotatedPath(sink),
      Array.from({ length: 3 }, (_, i) => ev(i + 1)),
    );
    writeEvents(sink, []);

    const data = parse(await getEvents.handle({ limit: 50 }, createCtx()));
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([1, 2, 3]);
  });

  it("tail mode hands back the max seq even when the newest event is filtered out", async () => {
    writeEvents(sink, [ev(1), ev(2), ev(3, { type: "reaction_add", emoji: "✅" })]);

    const data = parse(
      await getEvents.handle({ types: ["message_create"], limit: 50 }, createCtx()),
    );
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([1, 2]);
    expect(data.last_seq).toBe(3);
  });

  it("reads the rotated file when the cursor predates the active sink", async () => {
    writeEvents(
      rotatedPath(sink),
      Array.from({ length: 5 }, (_, i) => ev(i + 1)),
    );
    writeEvents(sink, [ev(6), ev(7), ev(8)]);
    const ctx = createCtx();

    const old = parse(await getEvents.handle({ after: 2, limit: 50 }, ctx));
    expect(old.events.map((e: SinkEvent) => e.seq)).toEqual([3, 4, 5, 6, 7, 8]);
    expect(old.last_seq).toBe(8);

    const recent = parse(await getEvents.handle({ after: 6, limit: 50 }, ctx));
    expect(recent.events.map((e: SinkEvent) => e.seq)).toEqual([7, 8]);
  });

  it("skips malformed lines instead of failing the poll", async () => {
    writeFileSync(
      sink,
      JSON.stringify(ev(1)) + "\n" + "{torn-write\n" + JSON.stringify(ev(2)) + "\n",
    );

    const data = parse(await getEvents.handle({ after: 0, limit: 50 }, createCtx()));
    expect(data.events.map((e: SinkEvent) => e.seq)).toEqual([1, 2]);
  });
});
