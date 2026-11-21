import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  MAX_LEDGER_RECORDS,
  ledgerPath,
  readLedger,
  updateLedger,
  writeLedger,
  type LedgerRecord,
} from "../../src/posts/ledger.js";

const isPosix = process.platform !== "win32";

let root: string;
let dir: string;
const original = process.env.DISCORD_OPS_POSTS_DIR;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "posts-ledger-"));
  dir = join(root, "posts");
  process.env.DISCORD_OPS_POSTS_DIR = dir;
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  if (original === undefined) delete process.env.DISCORD_OPS_POSTS_DIR;
  else process.env.DISCORD_OPS_POSTS_DIR = original;
});

function record(id: string, status: "pending" | "published"): LedgerRecord {
  return {
    id,
    preview_message_id: id,
    preview_channel_id: "123456789012345678",
    preview_webhook_id: "888888888888888888",
    header_message_id: "888888888888888887",
    type: "welcome",
    persona: "meelah",
    preset_key: "meelah",
    target_channel: "welcome",
    target_channel_id: "123456789012345679",
    post: { type: "welcome" },
    og: null,
    payload: {
      type: "welcome",
      target_channel_id: "123456789012345679",
      username: "Meelah",
      avatar_url: null,
      content: null,
      embeds: [],
      pin: false,
      thread_name: null,
      tags: [],
    },
    payload_sha256: "a".repeat(64),
    created_at: "2026-11-21T00:00:00.000Z",
    status,
    claimed_at: null,
    needs_approval: true,
    approved_by: null,
    published_message_id: null,
    published_at: null,
    via: "preview",
  };
}

describe("posts ledger", () => {
  it("reads an absent ledger as empty", () => {
    expect(readLedger("strawn-games")).toEqual({
      version: 1,
      project: "strawn-games",
      records: [],
    });
    expect(existsSync(dir)).toBe(false);
  });

  it("round-trips records", async () => {
    await updateLedger("strawn-games", (l) => {
      l.records.push(record("111111111111111111", "pending"));
    });
    const l = readLedger("strawn-games");
    expect(l.records).toHaveLength(1);
    expect(l.records[0]!.header_message_id).toBe("888888888888888887");
  });

  it.skipIf(!isPosix)("creates the directory 0700 and the file 0600", async () => {
    await updateLedger("strawn-games", () => {});
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(ledgerPath("strawn-games")).mode & 0o777).toBe(0o600);
  });

  it.skipIf(!isPosix)("refuses a symlinked ledger file on read and write", async () => {
    await updateLedger("strawn-games", () => {});
    const victim = join(root, "victim.json");
    writeFileSync(victim, "do not touch");
    rmSync(ledgerPath("strawn-games"));
    symlinkSync(victim, ledgerPath("strawn-games"));

    expect(() => readLedger("strawn-games")).toThrow(/symlink/);
    expect(() => writeLedger({ version: 1, project: "strawn-games", records: [] })).toThrow(
      /symlink/,
    );
    expect(readFileSync(victim, "utf-8")).toBe("do not touch");
  });

  it.each(["../escape", "a/b", "..", ".hidden", "", "x".repeat(101), "with space"])(
    "refuses unsafe project name %j",
    (name) => {
      expect(() => ledgerPath(name)).toThrow(/Refusing posts ledger/);
    },
  );

  it("refuses a ledger dir with parent traversal", () => {
    // path.join would normalize "..", so build the raw string by hand
    process.env.DISCORD_OPS_POSTS_DIR = `${root}/a/../b`;
    expect(() => ledgerPath("strawn-games")).toThrow(/parent traversal/);
  });

  it("throws on a corrupt ledger instead of resetting it", async () => {
    await updateLedger("strawn-games", () => {});
    writeFileSync(ledgerPath("strawn-games"), "{not json");
    expect(() => readLedger("strawn-games")).toThrow(/not valid JSON/);
    writeFileSync(
      ledgerPath("strawn-games"),
      JSON.stringify({ version: 1, project: "other", records: [] }),
    );
    expect(() => readLedger("strawn-games")).toThrow(/failed validation/);
  });

  it("caps records, dropping the oldest published first", async () => {
    await updateLedger("strawn-games", (l) => {
      l.records.push(record("pending-old", "pending"));
      for (let i = 0; i < MAX_LEDGER_RECORDS + 5; i++)
        l.records.push(record(`pub-${i}`, "published"));
    });
    const l = readLedger("strawn-games");
    expect(l.records).toHaveLength(MAX_LEDGER_RECORDS);
    expect(l.records[0]!.id).toBe("pending-old");
    expect(l.records.some((r) => r.id === "pub-0")).toBe(false);
    expect(l.records.at(-1)!.id).toBe(`pub-${MAX_LEDGER_RECORDS + 4}`);
  });

  it("leaves no temp files behind", async () => {
    await updateLedger("strawn-games", () => {});
    await updateLedger("strawn-games", () => {});
    expect(readdirSync(dir)).toEqual(["strawn-games.json"]);
  });

  it("removes its lock file after each update", async () => {
    await updateLedger("strawn-games", () => {});
    expect(existsSync(`${ledgerPath("strawn-games")}.lock`)).toBe(false);
  });

  it("breaks a stale lock left by a crashed process", async () => {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const lock = `${ledgerPath("strawn-games")}.lock`;
    writeFileSync(lock, "");
    const old = new Date(Date.now() - 60_000);
    utimesSync(lock, old, old);
    await updateLedger("strawn-games", (l) => {
      l.records.push(record("111111111111111111", "pending"));
    });
    expect(readLedger("strawn-games").records).toHaveLength(1);
  });

  it("serializes concurrent updates without losing writes", async () => {
    await Promise.all(
      Array.from({ length: 8 }, (_, i) =>
        updateLedger("strawn-games", (l) => {
          l.records.push(record(`r${i}`, "pending"));
        }),
      ),
    );
    expect(readLedger("strawn-games").records).toHaveLength(8);
  });

  it("leaves a lock it no longer owns (broken as stale and re-taken) in place", async () => {
    const lock = `${ledgerPath("strawn-games")}.lock`;
    await updateLedger("strawn-games", () => {
      writeFileSync(lock, "someone-else");
    });
    expect(readFileSync(lock, "utf-8")).toBe("someone-else");
  });

  it("does not write when the mutation throws", async () => {
    await updateLedger("strawn-games", (l) => {
      l.records.push(record("keep", "pending"));
    });
    await expect(
      updateLedger("strawn-games", (l) => {
        l.records.length = 0;
        throw new Error("abort");
      }),
    ).rejects.toThrow("abort");
    expect(readLedger("strawn-games").records).toHaveLength(1);
  });

  it.skipIf(!isPosix)("tightens a group/world-accessible ledger directory to 0700", async () => {
    mkdirSync(dir, { recursive: true });
    chmodSync(dir, 0o755);
    await updateLedger("strawn-games", () => {});
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it.skipIf(!isPosix)("refuses a symlinked ledger directory", async () => {
    const real = join(root, "real");
    mkdirSync(real, { mode: 0o700 });
    symlinkSync(real, dir);
    await expect(updateLedger("strawn-games", () => {})).rejects.toThrow(/not a plain directory/);
  });
});
