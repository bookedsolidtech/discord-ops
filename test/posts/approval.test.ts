import { describe, it, expect, vi } from "vitest";
import { findApprover, describeApprovers } from "../../src/posts/approval.js";
import type { ResolvedPostsConfig } from "../../src/config/personas.js";

const posts: ResolvedPostsConfig = {
  previewChannel: "feed-preview",
  approverUserIds: ["700000000000000001"],
  approverRoleIds: ["800000000000000001"],
  alwaysApprove: ["announcement", "character_line"],
};

function users(n: number, offset = 0) {
  return Array.from({ length: n }, (_, i) => ({
    id: String(600000000000000000n + BigInt(offset + i)),
  }));
}

/** A ✅ reaction whose users endpoint pages 100 at a time, like Discord's. */
function pagedMessage(all: Array<{ id: string; bot?: boolean }>) {
  const fetch = vi.fn(async ({ limit = 100, after }: { limit?: number; after?: string } = {}) => {
    const start = after ? all.findIndex((u) => u.id === after) + 1 : 0;
    return new Map(all.slice(start, start + limit).map((u) => [u.id, u]));
  });
  return {
    message: {
      reactions: {
        cache: new Map([["✅", { emoji: { name: "✅", toString: () => "✅" }, users: { fetch } }]]),
      },
    },
    fetch,
  };
}

const noMembers = {
  members: { fetch: vi.fn(async () => Promise.reject(new Error("Unknown Member"))) },
};

describe("findApprover", () => {
  it("finds an approver past the first 100 reactors", async () => {
    const all = [...users(150), { id: "700000000000000001" }];
    const { message, fetch } = pagedMessage(all);
    const result = await findApprover(message, noMembers, { ...posts, approverRoleIds: [] });
    expect(result).toEqual({ approved: true, approvedBy: "700000000000000001", via: "user" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[1]![0]).toMatchObject({ after: all[99]!.id });
  });

  it("finds an approver who only super-reacted (burst)", async () => {
    const fetch = vi.fn(
      async ({ type }: { type?: number } = {}) =>
        new Map(type === 1 ? [["700000000000000001", { id: "700000000000000001" }]] : []),
    );
    const message = {
      reactions: {
        cache: new Map([
          ["\u2705", { emoji: { name: "\u2705", toString: () => "\u2705" }, users: { fetch } }],
        ]),
      },
    };
    const result = await findApprover(message, noMembers, { ...posts, approverRoleIds: [] });
    expect(result).toMatchObject({ approved: true, approvedBy: "700000000000000001" });
    expect(fetch.mock.calls.map((c) => c[0]?.type)).toEqual([0, 1]);
  });

  it("stops after a short page", async () => {
    const { message, fetch } = pagedMessage(users(3));
    const result = await findApprover(message, noMembers, { ...posts, approverRoleIds: [] });
    expect(result.approved).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(2); // one short page each: normal, burst
  });

  it("skips members that cannot be fetched and keeps checking", async () => {
    const { message } = pagedMessage([{ id: "1" }, { id: "2" }]);
    const guild = {
      members: {
        fetch: vi.fn(async (id: string) => {
          if (id === "1") throw new Error("Unknown Member");
          return { roles: { cache: new Set(["800000000000000001"]) } };
        }),
      },
    };
    expect(await findApprover(message, guild, posts)).toEqual({
      approved: true,
      approvedBy: "2",
      via: "role",
    });
  });

  it("describes approvers, or says nobody can approve", () => {
    expect(describeApprovers(posts)).toBe(
      "<@700000000000000001> or a member with role <@&800000000000000001>",
    );
    expect(describeApprovers({ ...posts, approverUserIds: [], approverRoleIds: [] })).toMatch(
      /^nobody/,
    );
  });
});
