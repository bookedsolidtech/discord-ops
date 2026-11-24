import { describe, it, expect, afterEach, vi } from "vitest";
import { findUnknownProjectKeys } from "../../src/config/unknown-keys.js";
import { loadConfig } from "../../src/config/index.js";

const base = { guild_id: "444444444444444444", channels: {} };
const raw = (project: Record<string, unknown>) => ({ projects: { p: { ...base, ...project } } });

describe("findUnknownProjectKeys", () => {
  it.each(["webhook_sender", "webhookSenders", "webhook-senders", "weebhook_senders"])(
    "refuses %s as a misspelled webhook_senders",
    (key) => {
      const { errors } = findUnknownProjectKeys(raw({ [key]: {} }));
      expect(errors).toEqual([`p.${key} (did you mean "webhook_senders"?)`]);
    },
  );

  it.each(["deny_tool", "denyTools", "denied_tools"])(
    "refuses %s as a misspelled deny_tools",
    (key) => {
      expect(findUnknownProjectKeys(raw({ [key]: [] })).errors[0]).toContain("deny_tools");
    },
  );

  it("refuses a misspelled posts.require_approval", () => {
    const { errors } = findUnknownProjectKeys(raw({ posts: { requires_approval: true } }));
    expect(errors).toEqual(['p.posts.requires_approval (did you mean "require_approval"?)']);
  });

  it("warns about unrelated unknown keys", () => {
    const result = findUnknownProjectKeys(raw({ notes: "x", posts: { colour: 1 } }));
    expect(result).toEqual({ errors: [], warnings: ["p.notes", "p.posts.colour"] });
  });

  it("accepts every known key and malformed input", () => {
    const known = raw({ deny_tools: [], webhook_senders: {}, posts: { require_approval: true } });
    for (const value of [known, null, [], {}, { projects: { p: null } }]) {
      expect(findUnknownProjectKeys(value)).toEqual({ errors: [], warnings: [] });
    }
  });
});

describe("loadConfig with a misspelled guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("throws instead of dropping the key", () => {
    vi.stubEnv("DISCORD_TOKEN", "x".repeat(60));
    vi.stubEnv("DISCORD_OPS_CONFIG", JSON.stringify(raw({ webhook_sender: {} })));
    expect(() => loadConfig()).toThrow(/p\.webhook_sender.*webhook_senders/);
  });
});
