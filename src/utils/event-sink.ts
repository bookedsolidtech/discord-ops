import {
  appendFileSync,
  chmodSync,
  closeSync,
  existsSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readSync,
  renameSync,
  rmSync,
  statSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { ListenConfigSchema, type ListenConfig, type ListenEventType } from "../config/schema.js";
import type { LoadedConfig } from "../config/index.js";

/** Restrictive modes for the sink — it holds message content at rest. */
const SINK_FILE_MODE = 0o600;
const SINK_DIR_MODE = 0o700;

/**
 * Guards the configured sink path before any read or write. The sink holds
 * full message content at rest, so a mis-set `sink` is a data-leak (world-
 * readable) or, via a symlink target, a write primitive against another file.
 * Config is operator-controlled, but shared/committed configs make this worth
 * defending in depth:
 *  - reject parent-directory traversal segments in the configured path;
 *  - reject a sink (or its rotation target) that is a symlink — writing
 *    through it would mutate the link target, and reading through it would
 *    expose an arbitrary file's contents as "events".
 */
export function assertSafeSinkPath(sinkPath: string): void {
  if (sinkPath.split(/[/\\]/).includes("..")) {
    throw new Error(`Refusing sink path with parent traversal ("..") : ${sinkPath}`);
  }
  // Reject the sink file (and its rotation target) being a symlink — writing
  // through it would mutate the link target, reading through it would expose an
  // arbitrary file as "events". We deliberately do NOT walk the parent chain
  // rejecting every symlinked directory: macOS symlinks /tmp and /var, and many
  // setups symlink home or mount points, so a parent-chain ban rejects
  // legitimate sink locations. The sink path is operator-owned config (already
  // a trust boundary); the file-level check is the proportionate guard.
  for (const p of [sinkPath, rotatedPath(sinkPath)]) {
    let st;
    try {
      st = lstatSync(p);
    } catch {
      continue; // does not exist yet — fine
    }
    if (st.isSymbolicLink()) {
      throw new Error(`Refusing sink path that is a symlink: ${p}`);
    }
  }
}

/** Create/secure the sink directory (0700) and file (0600). */
function ensureSecureSinkFile(sinkPath: string): void {
  mkdirSync(dirname(sinkPath), { recursive: true, mode: SINK_DIR_MODE });
  if (!existsSync(sinkPath)) {
    writeFileSync(sinkPath, "", { mode: SINK_FILE_MODE });
  } else {
    // Tighten an existing sink that may have been created with a lax umask.
    try {
      chmodSync(sinkPath, SINK_FILE_MODE);
    } catch {
      // best-effort — a read-only mount or foreign owner shouldn't crash the sidecar
    }
  }
}

/**
 * Local event sink shared by the `discord-ops listen` sidecar (writer) and the
 * `get_events` tool (reader). The sink is a fast cache of gateway events — it
 * is never the source of truth; Discord channel history stays authoritative.
 */

/** Normalized gateway event as written to the JSONL sink. */
export interface SinkEvent {
  /** Monotonic sequence number — the cursor for get_events */
  seq: number;
  type: ListenEventType;
  /** Project name reverse-mapped from the config (raw IDs always included) */
  project?: string;
  /** Channel alias reverse-mapped from the config */
  channel?: string;
  channel_id: string;
  guild_id?: string;
  message_id: string;
  author?: string;
  author_bot?: boolean;
  /** Message events only */
  content?: string;
  /** Message events only — null unless the message is a true user reply */
  reply_to?: string | null;
  /** Reaction events only — round-trippable into add_reaction */
  emoji?: string;
  ts: string;
}

/** Rotate the sink once it exceeds ~50MB. */
export const DEFAULT_MAX_SINK_BYTES = 50 * 1024 * 1024;

/** A sink not written within this window means the sidecar is not running. */
export const SINK_ACTIVE_WINDOW_MS = 5 * 60 * 1000;

/** Bytes read from the file tail when resuming the sequence counter. */
const TAIL_BYTES = 64 * 1024;

/**
 * Resolves the effective listen config — the config file's `listen` block, or
 * schema defaults when the block is absent.
 */
export function resolveListenConfig(config: LoadedConfig): ListenConfig {
  return config.global.listen ?? ListenConfigSchema.parse({});
}

/** Single-depth rotation target: `<sink>.1` */
export function rotatedPath(sinkPath: string): string {
  return `${sinkPath}.1`;
}

/**
 * Reads the last `seq` from an existing sink so a restarted sidecar resumes
 * the monotonic sequence instead of restarting from 1. Falls back to the
 * rotated file when the active sink is empty (e.g. right after a rotation).
 */
export function readLastSeq(sinkPath: string): number {
  return lastSeqInFile(sinkPath) ?? lastSeqInFile(rotatedPath(sinkPath)) ?? 0;
}

function lastSeqInFile(path: string): number | undefined {
  if (!existsSync(path)) return undefined;
  const size = statSync(path).size;
  if (size === 0) return undefined;

  // Only read the tail — the sink can be tens of MB.
  const readBytes = Math.min(size, TAIL_BYTES);
  const buf = Buffer.alloc(readBytes);
  const fd = openSync(path, "r");
  try {
    readSync(fd, buf, 0, readBytes, size - readBytes);
  } finally {
    closeSync(fd);
  }

  let lines = buf.toString("utf-8").split("\n");
  // A mid-file start point means the first line is partial — drop it.
  if (readBytes < size) lines = lines.slice(1);

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as { seq?: unknown };
      if (typeof parsed.seq === "number" && Number.isFinite(parsed.seq)) return parsed.seq;
    } catch {
      // Skip malformed lines (e.g. a torn write from a crashed sidecar).
    }
  }
  return undefined;
}

/**
 * Parses a JSONL sink file into events, skipping blank and malformed lines.
 * Returns [] when the file does not exist.
 */
export function readSinkFile(path: string): SinkEvent[] {
  if (!existsSync(path)) return [];
  const events: SinkEvent[] = [];
  for (const line of readFileSync(path, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as SinkEvent;
      if (typeof parsed.seq === "number" && typeof parsed.type === "string") {
        events.push(parsed);
      }
    } catch {
      // Skip malformed lines — a torn tail write must not poison the feed.
    }
  }
  return events;
}

/**
 * True when the sink exists and was written (or heartbeat-touched) within the
 * last 5 minutes — i.e. the listener sidecar appears to be running.
 */
export function isSinkActive(path: string, now = Date.now()): boolean {
  if (!existsSync(path)) return false;
  return now - statSync(path).mtimeMs <= SINK_ACTIVE_WINDOW_MS;
}

export interface SinkWriterOptions {
  path: string;
  /** Rotation threshold in bytes (default ~50MB) */
  maxBytes?: number;
  /** Also emit each JSONL line here (e.g. process.stdout for `listen --stdout`) */
  echo?: { write(line: string): unknown };
}

/**
 * Appends normalized events to the JSONL sink with a monotonic `seq`,
 * resuming from an existing sink on startup and rotating to `<sink>.1`
 * once the file exceeds the size threshold (single rotation depth).
 */
export class SinkWriter {
  private readonly path: string;
  private readonly maxBytes: number;
  private readonly echo?: { write(line: string): unknown };
  private seq: number;
  private bytes: number;

  constructor(options: SinkWriterOptions) {
    this.path = options.path;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_SINK_BYTES;
    this.echo = options.echo;

    assertSafeSinkPath(this.path);
    // Create the dir (0700) and sink (0600) so message content at rest is not
    // world-readable; also touches the sink so get_events reports sink_active
    // as soon as the sidecar starts.
    ensureSecureSinkFile(this.path);

    this.seq = readLastSeq(this.path);
    this.bytes = statSync(this.path).size;
  }

  /** Last sequence number written (or resumed from an existing sink). */
  get lastSeq(): number {
    return this.seq;
  }

  /** Assigns the next monotonic seq, appends the JSONL line, and rotates when oversized. */
  append(event: Omit<SinkEvent, "seq">): SinkEvent {
    const full: SinkEvent = { seq: ++this.seq, ...event };
    const line = JSON.stringify(full) + "\n";
    appendFileSync(this.path, line);
    this.bytes += Buffer.byteLength(line);
    this.echo?.write(line);
    if (this.bytes > this.maxBytes) this.rotate();
    return full;
  }

  /** Heartbeat — bumps mtime so get_events sees an active sink during quiet periods. */
  touch(): void {
    const now = new Date();
    try {
      utimesSync(this.path, now, now);
    } catch {
      // Sink removed externally — the next append recreates it.
      this.recreate();
    }
  }

  private rotate(): void {
    // renameSync fails on Windows when the destination exists, so a second
    // rotation would leave the sidecar unable to write. Remove the previous
    // rotated file first (POSIX rename overwrites, so this is a no-op there
    // beyond the extra stat).
    const rotated = rotatedPath(this.path);
    rmSync(rotated, { force: true });
    renameSync(this.path, rotated);
    writeFileSync(this.path, "", { mode: SINK_FILE_MODE });
    this.bytes = 0;
  }

  private recreate(): void {
    ensureSecureSinkFile(this.path);
    this.bytes = 0;
  }
}
