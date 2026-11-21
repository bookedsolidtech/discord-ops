import { describe, it, expect, vi } from "vitest";
import { DIRECT_POST_TOOLS, directPostGateError } from "../../src/config/direct-post-gate.js";
import type { ToolContext } from "../../src/tools/types.js";

const KIDS_GUILD = "444444444444444444";
const DEV_GUILD = "555555555555555555";

function makeCtx(requireApproval: boolean | undefined, discord: Record<string, unknown> = {}) {
  // Raw channel fetch used by the gate; named getAnyChannel so "no Discord lookup" asserts read clearly.
  const getAnyChannel = vi.fn(async (id: string) => {
    if (id === "300000000000000001") return { guildId: KIDS_GUILD };
    if (id === "300000000000000002") return { guildId: DEV_GUILD };
    if (id === "300000000000000003") return { guildId: null, isDMBased: () => true };
    throw new Error("Unknown Channel");
  });
  return {
    discord: {
      getAnyChannel,
      getClient: vi.fn(async () => ({
        channels: { fetch: getAnyChannel },
        fetchWebhook: vi.fn(async (id: string) => {
          if (id === "600000000000000001") return { guildId: KIDS_GUILD };
          if (id === "600000000000000002") return { guildId: DEV_GUILD };
          throw new Error("Unknown Webhook");
        }),
      })),
      ...discord,
    },
    config: {
      defaultToken: "x".repeat(60),
      global: {
        default_project: "strawn-games",
        projects: {
          "strawn-games": {
            guild_id: KIDS_GUILD,
            channels: { general: "200000000000000001" },
            ...(requireApproval === undefined
              ? {}
              : { posts: { require_approval: requireApproval } }),
          },
          dev: { guild_id: DEV_GUILD, channels: { ci: "200000000000000002" } },
        },
      },
    },
  } as unknown as ToolContext;
}

describe("directPostGateError", () => {
  it("covers exactly the direct-posting tools", () => {
    expect([...DIRECT_POST_TOOLS].sort()).toEqual(
      [
        "create_forum_post",
        "create_thread",
        "edit_message",
        "execute_webhook",
        "forward_message",
        "leave_note",
        "notify_owners",
        "pin_message",
        "resolve_note",
        "send_as",
        "send_embed",
        "send_message",
        "send_poll",
        "send_template",
      ].sort(),
    );
  });

  it.each([...DIRECT_POST_TOOLS].filter((t) => t !== "execute_webhook" && t !== "create_thread"))(
    "refuses %s for a require_approval project, pointing to preview_post",
    async (tool) => {
      const params =
        tool === "forward_message"
          ? { project: "strawn-games", to_channel: "general" }
          : tool === "resolve_note"
            ? { project: "strawn-games", note_id: "1", reply: "done" }
            : { project: "strawn-games", channel: "general" };
      const error = await directPostGateError(tool, params, makeCtx(true));
      expect(error).toMatch(/require_approval/);
      expect(error).toMatch(/preview_post/);
    },
  );

  it.each([undefined, false])("allows direct posts when require_approval is %s", async (flag) => {
    const ctx = makeCtx(flag);
    expect(
      await directPostGateError(
        "send_message",
        { project: "strawn-games", channel: "general" },
        ctx,
      ),
    ).toBeUndefined();
    expect(ctx.discord.getAnyChannel).not.toHaveBeenCalled();
  });

  it("leaves read-only and posting-kit tools alone", async () => {
    const ctx = makeCtx(true);
    for (const tool of [
      "get_messages",
      "list_channels",
      "preview_post",
      "publish_post",
      "send_post",
    ]) {
      expect(await directPostGateError(tool, { project: "strawn-games" }, ctx)).toBeUndefined();
    }
  });

  it("applies through the default project when no project is passed", async () => {
    expect(
      await directPostGateError("send_message", { channel: "general" }, makeCtx(true)),
    ).toMatch(/"strawn-games"/);
  });

  it("allows other projects' guilds", async () => {
    expect(
      await directPostGateError("send_message", { project: "dev", channel: "ci" }, makeCtx(true)),
    ).toBeUndefined();
  });

  it("resolves a configured channel_id from config without calling Discord", async () => {
    const ctx = makeCtx(true);
    expect(
      await directPostGateError("send_message", { channel_id: "200000000000000001" }, ctx),
    ).toMatch(/blocked/);
    expect(
      await directPostGateError("send_message", { channel_id: "200000000000000002" }, ctx),
    ).toBeUndefined();
    expect(ctx.discord.getAnyChannel).not.toHaveBeenCalled();
  });

  it("looks up an unconfigured channel_id's guild, even when the project param names another project", async () => {
    const ctx = makeCtx(true);
    expect(
      await directPostGateError(
        "send_embed",
        { project: "dev", channel_id: "300000000000000001" },
        ctx,
      ),
    ).toMatch(/blocked/);
    expect(
      await directPostGateError("send_embed", { channel_id: "300000000000000002" }, ctx),
    ).toBeUndefined();
  });

  it("allows a confirmed DM channel (no guild) when another project requires approval", async () => {
    expect(
      await directPostGateError(
        "send_message",
        { channel_id: "300000000000000003" },
        makeCtx(true),
      ),
    ).toBeUndefined();
  });

  it("fails closed when the destination guild cannot be determined", async () => {
    expect(
      await directPostGateError(
        "send_message",
        { channel_id: "399999999999999999" },
        makeCtx(true),
      ),
    ).toMatch(/could not be determined/);
  });

  it("resolves execute_webhook through the webhook's guild", async () => {
    const ctx = makeCtx(true);
    expect(
      await directPostGateError("execute_webhook", { webhook_id: "600000000000000001" }, ctx),
    ).toMatch(/blocked/);
    expect(
      await directPostGateError("execute_webhook", { webhook_id: "600000000000000002" }, ctx),
    ).toBeUndefined();
    expect(
      await directPostGateError("execute_webhook", { webhook_id: "699999999999999999" }, ctx),
    ).toMatch(/could not be determined/);
  });

  it("gates forward_message on its destination, not its source", async () => {
    const ctx = makeCtx(true);
    expect(
      await directPostGateError(
        "forward_message",
        { channel_id: "200000000000000001", to_channel_id: "200000000000000002" },
        ctx,
      ),
    ).toBeUndefined();
    expect(
      await directPostGateError(
        "forward_message",
        { channel_id: "200000000000000002", to_channel_id: "200000000000000001" },
        ctx,
      ),
    ).toMatch(/blocked/);
  });

  it("gates notes, but allows the gated project's explicitly configured board", async () => {
    const ctx = makeCtx(true);
    const project = (ctx.config.global.projects as any)["strawn-games"];
    // No board configured: the board falls back to a kids-facing channel, so notes are blocked.
    expect(
      await directPostGateError("leave_note", { project: "strawn-games", body: "hi" }, ctx),
    ).toMatch(/blocked/);

    project.channels["agent-board"] = "200000000000000009";
    project.board_channel = "agent-board";
    expect(
      await directPostGateError("leave_note", { project: "strawn-games", body: "hi" }, ctx),
    ).toBeUndefined();
    expect(
      await directPostGateError(
        "leave_note",
        { body: "hi", channel_id: "200000000000000009" },
        ctx,
      ),
    ).toBeUndefined();
    // Overriding the board to any other channel is still blocked.
    expect(
      await directPostGateError(
        "leave_note",
        { project: "strawn-games", body: "hi", board_channel: "general" },
        ctx,
      ),
    ).toMatch(/blocked/);
    expect(
      await directPostGateError(
        "leave_note",
        { body: "hi", channel_id: "200000000000000001" },
        ctx,
      ),
    ).toMatch(/blocked/);
  });

  it("allows any gated project's own board when projects share a guild", async () => {
    const ctx = makeCtx(true);
    (ctx.config.global.projects as any).second = {
      guild_id: "444444444444444444",
      channels: { "agent-logs": "200000000000000011" },
      board_channel: "agent-logs",
      posts: { require_approval: true },
    };
    expect(
      await directPostGateError(
        "leave_note",
        { body: "hi", channel_id: "200000000000000011" },
        ctx,
      ),
    ).toBeUndefined();
    expect(
      await directPostGateError(
        "leave_note",
        { body: "hi", channel_id: "200000000000000001" },
        ctx,
      ),
    ).toMatch(/blocked/);
  });

  it("gates resolve_note only when it posts a reply", async () => {
    const ctx = makeCtx(true);
    expect(
      await directPostGateError("resolve_note", { project: "strawn-games", note_id: "1" }, ctx),
    ).toBeUndefined();
    expect(
      await directPostGateError(
        "resolve_note",
        { project: "strawn-games", note_id: "1", reply: " " },
        ctx,
      ),
    ).toMatch(/blocked/);
  });

  it("gates pin_message by the channel it pins in", async () => {
    const ctx = makeCtx(true);
    expect(
      await directPostGateError(
        "pin_message",
        { channel_id: "200000000000000001", message_id: "1" },
        ctx,
      ),
    ).toMatch(/blocked.*preview_post/);
    expect(
      await directPostGateError(
        "pin_message",
        { channel_id: "200000000000000002", message_id: "1" },
        ctx,
      ),
    ).toBeUndefined();
  });

  it("gates create_thread only when it carries a starter message", async () => {
    const ctx = makeCtx(true);
    const base = { project: "strawn-games", channel: "general", name: "t" };
    expect(await directPostGateError("create_thread", base, ctx)).toBeUndefined();
    expect(
      await directPostGateError("create_thread", { ...base, initial_message: "" }, ctx),
    ).toBeUndefined();
    // Whitespace still posts in the handler, so it is gated too.
    expect(
      await directPostGateError("create_thread", { ...base, initial_message: "  " }, ctx),
    ).toMatch(/blocked/);
    expect(
      await directPostGateError("create_thread", { ...base, initial_message: "hi" }, ctx),
    ).toMatch(/blocked/);
  });
});
