import { ProjectConfigSchema, PostsConfigSchema } from "./schema.js";

/** Settings that refuse actions. Dropping one silently would turn its guard off. */
const PROJECT_GUARDS = ["deny_tools", "webhook_senders"];
const POSTS_GUARDS = ["require_approval"];

const MAX_TYPO_DISTANCE = 3;

const normalize = (key: string): string => key.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Levenshtein distance between two short strings. */
function distance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      next.push(Math.min(row[j]! + 1, next[j - 1]! + 1, row[j - 1]! + cost));
    }
    row = next;
  }
  return row[b.length]!;
}

export interface UnknownKeys {
  /** Unknown keys that look like a misspelled guard; the config must be refused. */
  errors: string[];
  /** Other unknown keys, which are ignored. */
  warnings: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Finds unknown keys in the raw (unparsed) projects section of a global config. */
export function findUnknownProjectKeys(raw: unknown): UnknownKeys {
  const result: UnknownKeys = { errors: [], warnings: [] };
  if (!isObject(raw) || !isObject(raw.projects)) return result;

  const check = (value: unknown, known: object, guards: string[], path: string) => {
    if (!isObject(value)) return;
    for (const key of Object.keys(value)) {
      if (Object.hasOwn(known, key)) continue;
      const guard = guards.find((g) => distance(normalize(key), normalize(g)) <= MAX_TYPO_DISTANCE);
      if (guard) result.errors.push(`${path}.${key} (did you mean "${guard}"?)`);
      else result.warnings.push(`${path}.${key}`);
    }
  };

  for (const [name, project] of Object.entries(raw.projects)) {
    if (!isObject(project)) continue;
    check(project, ProjectConfigSchema.shape, PROJECT_GUARDS, name);
    check(project.posts, PostsConfigSchema.shape, POSTS_GUARDS, `${name}.posts`);
  }
  return result;
}
