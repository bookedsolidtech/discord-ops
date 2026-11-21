import {
  closeSync,
  constants as fsConstants,
  chmodSync,
  fstatSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { PostTypeEnum } from "../config/schema.js";

/**
 * Local posting-kit ledger: one JSON file per project holding pending
 * previews and published posts.
 *
 * The ledger gates what reaches a kids' server feed, so it is written with
 * the same at-rest protections as the `listen` event sink: 0700 directory,
 * 0600 file, refusal of parent traversal and of a symlinked ledger file.
 * Writes are atomic (exclusive temp file + rename), so a crash never leaves
 * a torn ledger and a rename never follows a planted symlink. Mutations take
 * an exclusive lock file so concurrent MCP processes (one per agent session)
 * cannot lose each other's writes.
 */

const LEDGER_FILE_MODE = 0o600;
const LEDGER_DIR_MODE = 0o700;

/** Bound the file: keep at most this many records, dropping the oldest finished ones first. */
export const MAX_LEDGER_RECORDS = 500;

const PayloadSchema = z.object({
  type: PostTypeEnum,
  target_channel_id: z.string(),
  username: z.string(),
  avatar_url: z.string().nullable(),
  content: z.string().nullable(),
  embeds: z.array(z.record(z.string(), z.unknown())),
  pin: z.boolean(),
  /** forum_post: thread name and tag names for the new forum thread. */
  thread_name: z.string().nullable(),
  tags: z.array(z.string()),
});

export type PostPayload = z.infer<typeof PayloadSchema>;

const RecordSchema = z.object({
  /** Preview message id for previews; the published message id for send_post records. */
  id: z.string(),
  preview_message_id: z.string().nullable(),
  preview_channel_id: z.string().nullable(),
  /** Webhook that posted the preview — publish checks the fetched preview came from it. */
  preview_webhook_id: z.string().nullable(),
  /** The "PREVIEW → …" header message posted just before the preview. */
  header_message_id: z.string().nullable(),
  type: PostTypeEnum,
  persona: z.string(),
  preset_key: z.string().nullable(),
  target_channel: z.string(),
  target_channel_id: z.string(),
  /** The validated post input, kept so publish can re-render it. */
  post: z.record(z.string(), z.unknown()),
  /** OG snapshot used for video_upload renders. */
  og: z
    .object({
      title: z.string().optional(),
      description: z.string().optional(),
      image: z.string().optional(),
      author_name: z.string().optional(),
      author_url: z.string().optional(),
      error: z.string().optional(),
    })
    .nullable(),
  payload: PayloadSchema,
  payload_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  created_at: z.string(),
  /** "publishing" is a cross-process claim taken before the send; it blocks a second publish. */
  status: z.enum(["pending", "publishing", "published"]),
  claimed_at: z.string().nullable(),
  needs_approval: z.boolean(),
  approved_by: z.string().nullable(),
  published_message_id: z.string().nullable(),
  published_at: z.string().nullable(),
  via: z.enum(["preview", "send_post"]),
});

export type LedgerRecord = z.infer<typeof RecordSchema>;

const LedgerSchema = z.object({
  version: z.literal(1),
  project: z.string(),
  records: z.array(RecordSchema),
});

export type Ledger = z.infer<typeof LedgerSchema>;

/** Project names become file names — keep them to a conservative charset. */
const SAFE_PROJECT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

export function ledgerDir(): string {
  return process.env.DISCORD_OPS_POSTS_DIR || join(homedir(), ".discord-ops", "posts");
}

/** Resolves and guards the ledger path for a project. Throws on unsafe input. */
export function ledgerPath(project: string): string {
  if (!SAFE_PROJECT.test(project) || project.includes("..")) {
    throw new Error(
      `Refusing posts ledger for project "${project}": project names used as ledger files may only contain letters, digits, ".", "_", and "-"`,
    );
  }
  const dir = ledgerDir();
  if (dir.split(/[/\\]/).includes("..")) {
    throw new Error(`Refusing posts ledger directory with parent traversal (".."): ${dir}`);
  }
  return join(dir, `${project}.json`);
}

function assertNotSymlink(path: string): void {
  let st;
  try {
    st = lstatSync(path);
  } catch {
    return; // does not exist yet
  }
  if (st.isSymbolicLink()) {
    throw new Error(`Refusing posts ledger path that is a symlink: ${path}`);
  }
  if (!st.isFile()) {
    throw new Error(`Refusing posts ledger path that is not a regular file: ${path}`);
  }
}

function emptyLedger(project: string): Ledger {
  return { version: 1, project, records: [] };
}

/** Reads a project's ledger; an absent file is an empty ledger. Corruption throws — never silently reset. */
export function readLedger(project: string): Ledger {
  const path = ledgerPath(project);
  assertNotSymlink(path);
  let fd: number;
  try {
    // O_NOFOLLOW closes the lstat→open window on POSIX.
    fd = openSync(path, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return emptyLedger(project);
    throw new Error(
      `Cannot open posts ledger ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  let raw: string;
  try {
    if (!fstatSync(fd).isFile()) {
      throw new Error(`Refusing posts ledger path that is not a regular file: ${path}`);
    }
    raw = readFileSync(fd, "utf-8");
  } finally {
    closeSync(fd);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Posts ledger ${path} is not valid JSON — fix or move it aside`);
  }
  const result = LedgerSchema.safeParse(parsed);
  if (!result.success || result.data.project !== project) {
    throw new Error(`Posts ledger ${path} failed validation — fix or move it aside`);
  }
  return result.data;
}

/** Drops the oldest published records once the ledger exceeds MAX_LEDGER_RECORDS. */
function trim(records: LedgerRecord[]): LedgerRecord[] {
  let excess = records.length - MAX_LEDGER_RECORDS;
  if (excess <= 0) return records;
  const out: LedgerRecord[] = [];
  for (const record of records) {
    if (excess > 0 && record.status === "published") {
      excess--;
      continue;
    }
    out.push(record);
  }
  // Still over (all pending) — drop the oldest pending previews.
  return out.length > MAX_LEDGER_RECORDS ? out.slice(out.length - MAX_LEDGER_RECORDS) : out;
}

/**
 * Creates the ledger directory (0700) and refuses one that another user owns
 * or that is group/world-writable — either would let someone else swap the
 * ledger file between our checks and the rename.
 */
function ensureSecureDir(dir: string): void {
  mkdirSync(dir, { recursive: true, mode: LEDGER_DIR_MODE });
  const st = lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) {
    throw new Error(`Refusing posts ledger directory that is not a plain directory: ${dir}`);
  }
  if (typeof process.getuid === "function") {
    if (st.uid !== process.getuid()) {
      throw new Error(`Refusing posts ledger directory owned by another user: ${dir}`);
    }
    if ((st.mode & 0o077) !== 0) {
      try {
        chmodSync(dir, LEDGER_DIR_MODE);
      } catch {
        throw new Error(`Cannot restrict posts ledger directory to 0700: ${dir}`);
      }
    }
  }
}

/** Atomically writes a project's ledger with 0700/0600 modes. Callers should hold the ledger lock. */
export function writeLedger(ledger: Ledger): void {
  const path = ledgerPath(ledger.project);
  ensureSecureDir(ledgerDir());
  assertNotSymlink(path);

  const data = JSON.stringify({ ...ledger, records: trim(ledger.records) }, null, 2) + "\n";
  const tmp = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    // "wx" = O_CREAT|O_EXCL: never writes through a pre-existing file or symlink.
    writeFileSync(tmp, data, { mode: LEDGER_FILE_MODE, flag: "wx" });
    renameSync(tmp, path);
  } catch (err) {
    rmSync(tmp, { force: true });
    throw err;
  }
}

/** A lock older than this is from a crashed process and may be broken. */
const STALE_LOCK_MS = 30_000;
// Long enough to wait out another session's preview (two Discord sends).
const LOCK_TIMEOUT_MS = 15_000;
const LOCK_RETRY_MS = 25;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Refreshes the lock's mtime while held, so a long hold never looks stale. */
const HEARTBEAT_MS = 5_000;

interface HeldLock {
  path: string;
  owner: string;
  heartbeat: ReturnType<typeof setInterval>;
}

async function acquireLock(lockPath: string): Promise<HeldLock> {
  const deadline = Date.now() + LOCK_TIMEOUT_MS;
  const owner = `${process.pid}.${randomBytes(8).toString("hex")}`;
  for (;;) {
    try {
      const fd = openSync(lockPath, "wx", LEDGER_FILE_MODE);
      try {
        writeFileSync(fd, owner);
      } finally {
        closeSync(fd);
      }
      const heartbeat = setInterval(() => {
        try {
          const now = new Date();
          utimesSync(lockPath, now, now);
        } catch {
          // released or broken — releaseLock checks ownership
        }
      }, HEARTBEAT_MS);
      heartbeat.unref();
      return { path: lockPath, owner, heartbeat };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
    }
    try {
      const st = lstatSync(lockPath);
      if (Date.now() - st.mtimeMs > STALE_LOCK_MS) {
        // Take over a stale lock by atomic rename, then confirm we moved the
        // stale file we inspected (same inode) — not a fresh lock another
        // process created after our lstat. If we grabbed a fresh one, put it back.
        const tomb = `${lockPath}.stale-${randomBytes(6).toString("hex")}`;
        try {
          renameSync(lockPath, tomb);
        } catch {
          continue; // someone else moved it first
        }
        try {
          if (lstatSync(tomb).ino !== st.ino) linkSync(tomb, lockPath);
        } catch {
          // a new lock already exists at lockPath; leave it be
        }
        rmSync(tomb, { force: true });
        continue;
      }
    } catch {
      continue; // released between our open and lstat
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for the posts ledger lock: ${lockPath}`);
    }
    await sleep(LOCK_RETRY_MS);
  }
}

/** Removes the lock only if this holder still owns it (a broken-stale lock may have a new owner). */
function releaseLock(lock: HeldLock): void {
  clearInterval(lock.heartbeat);
  try {
    if (readFileSync(lock.path, "utf-8") === lock.owner) rmSync(lock.path, { force: true });
  } catch {
    // already gone
  }
}

/**
 * Runs `fn` holding a lock scoped to one Discord channel — for work that
 * must not interleave in that channel across projects (a shared preview
 * channel), independent of any project's ledger lock.
 */
export async function withChannelLock<T>(channelId: string, fn: () => Promise<T>): Promise<T> {
  if (!/^\d{17,20}$/.test(channelId)) throw new Error(`Invalid channel id for lock: ${channelId}`);
  const dir = ledgerDir();
  if (dir.split(/[/\\]/).includes("..")) {
    throw new Error(`Refusing posts ledger directory with parent traversal (".."): ${dir}`);
  }
  ensureSecureDir(dir);
  const lock = await acquireLock(join(dir, `channel-${channelId}.lock`));
  try {
    return await fn();
  } finally {
    releaseLock(lock);
  }
}

/**
 * Locked read-modify-write. Holds the project's exclusive lock file
 * (`<ledger>.lock`) so concurrent MCP processes serialize; the mutation sees
 * the latest on-disk ledger and may throw to abort without writing.
 */
export async function updateLedger<T>(project: string, mutate: (ledger: Ledger) => T): Promise<T> {
  const path = ledgerPath(project);
  ensureSecureDir(ledgerDir());
  const lock = await acquireLock(`${path}.lock`);
  try {
    const ledger = readLedger(project);
    const result = mutate(ledger);
    writeLedger(ledger);
    return result;
  } finally {
    releaseLock(lock);
  }
}
