import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));

import { lookup } from "node:dns/promises";
import { setBotNick } from "../../src/tools/botops/set-bot-nick.js";
import { updateApplication } from "../../src/tools/botops/update-application.js";
import { listAppEmojis } from "../../src/tools/botops/list-app-emojis.js";
import { createAppEmoji } from "../../src/tools/botops/create-app-emoji.js";
import { deleteAppEmoji } from "../../src/tools/botops/delete-app-emoji.js";
import {
  fetchImageAsDataUri,
  MAX_ICON_BYTES,
  MAX_EMOJI_BYTES,
} from "../../src/tools/botops/image-fetch.js";
import { createMockConfig } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

// ---------------------------------------------------------------------------
// Mocks — placeholder snowflakes only
// ---------------------------------------------------------------------------

const GUILD_ID = "444444444444444444";
const APP_ID = "131313131313131313";
const EMOJI_ID = "121212121212121212";

function createMockEmoji(overrides: Record<string, unknown> = {}) {
  return {
    id: EMOJI_ID,
    name: "party_blob",
    animated: false,
    ...overrides,
  };
}

function createMockApplication(overrides: Record<string, unknown> = {}) {
  const emoji = createMockEmoji();
  const emojiMap = new Map([[emoji.id, emoji]]) as any;
  emojiMap.map = (fn: any) => [...emojiMap.values()].map(fn);

  const app: any = {
    id: APP_ID,
    name: "Test App",
    description: "old description",
    tags: [],
    icon: null,
    emojis: {
      fetch: vi.fn().mockResolvedValue(emojiMap),
      create: vi.fn().mockImplementation(async ({ name }: { name: string }) => ({
        id: "141414141414141414",
        name,
        animated: false,
      })),
      delete: vi.fn().mockResolvedValue(undefined),
    },
    ...overrides,
  };
  app.edit = vi.fn().mockImplementation(async (options: any) => ({
    ...app,
    ...(options.description !== undefined ? { description: options.description } : {}),
    ...(options.tags !== undefined ? { tags: options.tags } : {}),
    ...(options.icon ? { icon: "a1b2c3iconhash" } : {}),
  }));
  return app;
}

function createBotopsCtx(appOverrides: Record<string, unknown> = {}) {
  const app = appOverrides.nullApplication ? null : createMockApplication(appOverrides);
  const me = {
    setNickname: vi.fn().mockResolvedValue(undefined),
  };
  const guild = {
    id: GUILD_ID,
    members: {
      me,
      fetchMe: vi.fn().mockResolvedValue(me),
    },
  };
  const getClient = vi.fn().mockResolvedValue({ application: app });
  const getGuild = vi.fn().mockResolvedValue(guild);
  const ctx: ToolContext = {
    discord: { getClient, getGuild } as any,
    config: createMockConfig() as any,
  };
  return { ctx, app, me, guild, getClient, getGuild };
}

function parseResult(result: { content: Array<{ text: string }> }) {
  return JSON.parse(result.content[0]!.text);
}

function stubFetchResponse(
  body: BodyInit | null,
  init: { status?: number; headers?: Record<string, string> } = {},
) {
  const response = new Response(body, {
    status: init.status ?? 200,
    headers: init.headers ?? { "content-type": "image/png" },
  });
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

beforeEach(() => {
  vi.mocked(lookup).mockReset();
  // Default: hostnames resolve to a public address
  vi.mocked(lookup).mockResolvedValue({ address: "93.184.216.34", family: 4 } as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Category metadata
// ---------------------------------------------------------------------------

describe("botops category", () => {
  it("registers all five tools under the botops category with expected names", () => {
    const tools = [setBotNick, updateApplication, listAppEmojis, createAppEmoji, deleteAppEmoji];
    expect(tools.map((t) => t.name)).toEqual([
      "set_bot_nick",
      "update_application",
      "list_app_emojis",
      "create_app_emoji",
      "delete_app_emoji",
    ]);
    for (const tool of tools) {
      expect(tool.category).toBe("botops");
    }
  });
});

// ---------------------------------------------------------------------------
// set_bot_nick
// ---------------------------------------------------------------------------

describe("set_bot_nick", () => {
  it("sets the bot nickname via guild_id", async () => {
    const { ctx, me } = createBotopsCtx();
    const result = await setBotNick.handle({ guild_id: GUILD_ID, nick: "Ops Bot" }, ctx);
    expect(result.isError).toBeUndefined();
    expect(me.setNickname).toHaveBeenCalledWith("Ops Bot");
    expect(parseResult(result)).toEqual({ guild_id: GUILD_ID, nick: "Ops Bot" });
  });

  it("clears the nickname when nick is null", async () => {
    const { ctx, me } = createBotopsCtx();
    const result = await setBotNick.handle({ guild_id: GUILD_ID, nick: null }, ctx);
    expect(me.setNickname).toHaveBeenCalledWith(null);
    expect(parseResult(result)).toEqual({ guild_id: GUILD_ID, nick: null });
  });

  it("clears the nickname when nick is an empty string", async () => {
    const { ctx, me } = createBotopsCtx();
    const result = await setBotNick.handle({ guild_id: GUILD_ID, nick: "" }, ctx);
    expect(me.setNickname).toHaveBeenCalledWith(null);
    expect(parseResult(result).nick).toBeNull();
  });

  it("resolves the guild from the project when guild_id is omitted", async () => {
    const { ctx, getGuild } = createBotopsCtx();
    const result = await setBotNick.handle({ project: "test-project", nick: "Deploy Bot" }, ctx);
    expect(result.isError).toBeUndefined();
    expect(getGuild).toHaveBeenCalledWith(GUILD_ID, (ctx.config as any).defaultToken);
    expect(parseResult(result).guild_id).toBe(GUILD_ID);
  });

  it("resolves the default project when neither guild_id nor project is given", async () => {
    const { ctx } = createBotopsCtx();
    const result = await setBotNick.handle({ nick: "Default Bot" }, ctx);
    expect(result.isError).toBeUndefined();
    expect(parseResult(result).guild_id).toBe(GUILD_ID);
  });

  it("returns a routing error for an unknown project", async () => {
    const { ctx, me } = createBotopsCtx();
    const result = await setBotNick.handle({ project: "nope", nick: "X" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('"nope" not found');
    expect(me.setNickname).not.toHaveBeenCalled();
  });

  it("errors when no guild_id, no project, and no default_project", async () => {
    const { ctx } = createBotopsCtx();
    delete (ctx.config as any).global.default_project;
    const result = await setBotNick.handle({ nick: "X" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("no default_project");
  });

  it("rejects nicknames longer than 32 characters at the schema level", () => {
    const parsed = setBotNick.inputSchema.safeParse({
      guild_id: GUILD_ID,
      nick: "x".repeat(33),
    });
    expect(parsed.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// update_application
// ---------------------------------------------------------------------------

describe("update_application", () => {
  it("maps description and tags to the application edit payload", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await updateApplication.handle(
      { description: "New description", tags: ["ops", "ci"] },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(app.edit).toHaveBeenCalledWith({ description: "New description", tags: ["ops", "ci"] });
    const data = parseResult(result);
    expect(data).toEqual({
      id: APP_ID,
      name: "Test App",
      description: "New description",
      tags: ["ops", "ci"],
      icon_set: false,
    });
    // Never leak sensitive application fields
    expect(JSON.stringify(data)).not.toContain("token");
  });

  it("maps install params scopes and permissions bitfield", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await updateApplication.handle(
      {
        install_params_scopes: ["bot", "applications.commands"],
        install_params_permissions: "8",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const options = app.edit.mock.calls[0][0];
    expect(options.installParams.scopes).toEqual(["bot", "applications.commands"]);
    expect(options.installParams.permissions.bitfield).toBe(8n);
  });

  it("defaults install params permissions to 0 when only scopes given", async () => {
    const { ctx, app } = createBotopsCtx();
    await updateApplication.handle({ install_params_scopes: ["bot"] }, ctx);
    const options = app.edit.mock.calls[0][0];
    expect(options.installParams.permissions.bitfield).toBe(0n);
  });

  it("rejects invalid OAuth2 scopes", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await updateApplication.handle(
      { install_params_scopes: ["bot", "not_a_scope"] },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("not_a_scope");
    expect(app.edit).not.toHaveBeenCalled();
  });

  it("rejects install_params_permissions without scopes", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await updateApplication.handle({ install_params_permissions: "8" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("requires install_params_scopes");
    expect(app.edit).not.toHaveBeenCalled();
  });

  it("errors when no editable fields are provided", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await updateApplication.handle({ project: "test-project" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("at least one field");
    expect(app.edit).not.toHaveBeenCalled();
  });

  it("maps the custom install URL", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await updateApplication.handle(
      { custom_install_url: "https://example.com/install" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(app.edit).toHaveBeenCalledWith({
      customInstallURL: "https://example.com/install",
    });
  });

  it("does not expose interactions_endpoint_url — it is a control-plane field", () => {
    // B2: pointing a bot's interaction traffic at an attacker URL is a
    // control-plane hijack, so the field must not be accepted at all.
    const parsed = updateApplication.inputSchema.safeParse({
      interactions_endpoint_url: "https://api.example.com/interactions",
    });
    // Unknown key is stripped by Zod, leaving no updatable field.
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect("interactions_endpoint_url" in parsed.data).toBe(false);
    }
    expect(updateApplication.description).toMatch(/control-plane field/i);
  });

  it("rejects non-HTTPS and private custom install URLs at the schema level", () => {
    const httpUrl = updateApplication.inputSchema.safeParse({
      custom_install_url: "http://example.com/install",
    });
    expect(httpUrl.success).toBe(false);

    const privateInstall = updateApplication.inputSchema.safeParse({
      custom_install_url: "https://192.168.1.10/install",
    });
    expect(privateInstall.success).toBe(false);
  });

  it("fetches icon_url and passes a data URI to edit", async () => {
    const { ctx, app } = createBotopsCtx();
    const fetchMock = stubFetchResponse(PNG_BYTES);
    const result = await updateApplication.handle(
      { icon_url: "https://cdn.example.com/icon.png" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const options = app.edit.mock.calls[0][0];
    expect(options.icon).toBe(`data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`);
    expect(parseResult(result).icon_set).toBe(true);
  });

  it("rejects icon_url with a non-image content-type and does not edit", async () => {
    const { ctx, app } = createBotopsCtx();
    stubFetchResponse("<html>not an image</html>", {
      headers: { "content-type": "text/html" },
    });
    const result = await updateApplication.handle(
      { icon_url: "https://cdn.example.com/icon.png" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("content-type");
    expect(app.edit).not.toHaveBeenCalled();
  });

  it("returns a routing error for an unknown project", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await updateApplication.handle({ project: "ghost", description: "hello" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain('"ghost" not found');
    expect(app.edit).not.toHaveBeenCalled();
  });

  it("errors when no project is given and there is no default project or token", async () => {
    const { ctx, app } = createBotopsCtx();
    // Per-project-token install: no default token, no default project.
    (ctx.config as any).defaultToken = undefined;
    (ctx.config as any).global.default_project = undefined;
    const result = await updateApplication.handle({ description: "hello" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("No project specified");
    expect(app.edit).not.toHaveBeenCalled();
  });

  it("errors cleanly when the client application is unavailable", async () => {
    const { ctx } = createBotopsCtx({ nullApplication: true });
    const result = await updateApplication.handle({ description: "hello" }, ctx);
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("application unavailable");
  });

  it("documents that global application name changes are not supported", () => {
    expect(updateApplication.description).toMatch(/NAME changes/);
    expect(updateApplication.description).toMatch(/intentionally NOT supported/);
    expect(updateApplication.description).toContain("set_bot_nick");
  });
});

// ---------------------------------------------------------------------------
// list_app_emojis
// ---------------------------------------------------------------------------

describe("list_app_emojis", () => {
  it("lists emojis with the message-ready identifier", async () => {
    const { ctx } = createBotopsCtx();
    const result = await listAppEmojis.handle({}, ctx);
    expect(result.isError).toBeUndefined();
    const data = parseResult(result);
    expect(data.application_id).toBe(APP_ID);
    expect(data.count).toBe(1);
    expect(data.emojis[0]).toEqual({
      id: EMOJI_ID,
      name: "party_blob",
      animated: false,
      identifier: `<:party_blob:${EMOJI_ID}>`,
    });
  });

  it("uses the animated identifier form for animated emojis", async () => {
    const { ctx, app } = createBotopsCtx();
    const animated = createMockEmoji({ name: "loading", animated: true });
    const map = new Map([[animated.id, animated]]) as any;
    map.map = (fn: any) => [...map.values()].map(fn);
    app.emojis.fetch.mockResolvedValue(map);

    const result = await listAppEmojis.handle({}, ctx);
    const data = parseResult(result);
    expect(data.emojis[0].identifier).toBe(`<a:loading:${EMOJI_ID}>`);
  });
});

// ---------------------------------------------------------------------------
// create_app_emoji
// ---------------------------------------------------------------------------

describe("create_app_emoji", () => {
  it("creates an emoji from a fetched data URI and returns the identifier", async () => {
    const { ctx, app } = createBotopsCtx();
    stubFetchResponse(PNG_BYTES);
    const result = await createAppEmoji.handle(
      { name: "ship_it", image_url: "https://cdn.example.com/ship.png" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(app.emojis.create).toHaveBeenCalledWith({
      attachment: `data:image/png;base64,${Buffer.from(PNG_BYTES).toString("base64")}`,
      name: "ship_it",
    });
    expect(parseResult(result)).toEqual({
      id: "141414141414141414",
      name: "ship_it",
      animated: false,
      identifier: "<:ship_it:141414141414141414>",
    });
  });

  it("rejects invalid emoji names at the schema level", () => {
    for (const name of ["x", "bad-name", "has space", "way!", "a".repeat(33)]) {
      const parsed = createAppEmoji.inputSchema.safeParse({
        name,
        image_url: "https://cdn.example.com/e.png",
      });
      expect(parsed.success, `name "${name}" should be rejected`).toBe(false);
    }
    const ok = createAppEmoji.inputSchema.safeParse({
      name: "Party_Blob_2",
      image_url: "https://cdn.example.com/e.png",
    });
    expect(ok.success).toBe(true);
  });

  it("rejects images whose declared size exceeds the 256KB emoji limit", async () => {
    const { ctx, app } = createBotopsCtx();
    stubFetchResponse(PNG_BYTES, {
      headers: {
        "content-type": "image/png",
        "content-length": String(MAX_EMOJI_BYTES + 1),
      },
    });
    const result = await createAppEmoji.handle(
      { name: "too_big", image_url: "https://cdn.example.com/big.png" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(result.content[0]!.text).toContain("exceeds");
    expect(app.emojis.create).not.toHaveBeenCalled();
  });

  it("blocks SSRF image URLs without ever fetching", async () => {
    const { ctx, app } = createBotopsCtx();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    for (const url of [
      "http://169.254.169.254/latest/meta-data",
      "http://localhost/emoji.png",
      "http://127.0.0.1/emoji.png",
      "http://10.0.0.5/emoji.png",
      "ftp://cdn.example.com/emoji.png",
    ]) {
      const result = await createAppEmoji.handle({ name: "sneaky", image_url: url }, ctx);
      expect(result.isError, `url "${url}" should be blocked`).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    expect(app.emojis.create).not.toHaveBeenCalled();
  });

  it("returns a routing error for an unknown project", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await createAppEmoji.handle(
      { project: "ghost", name: "blob", image_url: "https://cdn.example.com/e.png" },
      ctx,
    );
    expect(result.isError).toBe(true);
    expect(app.emojis.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// delete_app_emoji
// ---------------------------------------------------------------------------

describe("delete_app_emoji", () => {
  it("deletes the emoji by ID", async () => {
    const { ctx, app } = createBotopsCtx();
    const result = await deleteAppEmoji.handle({ emoji_id: EMOJI_ID }, ctx);
    expect(result.isError).toBeUndefined();
    expect(app.emojis.delete).toHaveBeenCalledWith(EMOJI_ID);
    expect(parseResult(result)).toEqual({ deleted: true, emoji_id: EMOJI_ID });
  });

  it("is flagged destructive", () => {
    expect(deleteAppEmoji.destructive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// fetchImageAsDataUri — validation and rejection paths
// ---------------------------------------------------------------------------

describe("fetchImageAsDataUri", () => {
  it("returns a data URI with content type and byte count on success", async () => {
    stubFetchResponse(PNG_BYTES);
    const result = await fetchImageAsDataUri("https://cdn.example.com/ok.png", MAX_ICON_BYTES);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.contentType).toBe("image/png");
      expect(result.bytes).toBe(PNG_BYTES.byteLength);
      expect(result.dataUri.startsWith("data:image/png;base64,")).toBe(true);
    }
  });

  it("keeps the original hostname (valid TLS) and pins the connection via a dispatcher", async () => {
    const fetchMock = stubFetchResponse(PNG_BYTES);
    await fetchImageAsDataUri("https://cdn.example.com/ok.png", MAX_ICON_BYTES);
    const [requestUrl, options] = fetchMock.mock.calls[0];
    // URL is unchanged so TLS SNI + cert validation use the real hostname;
    // rebinding is prevented by the pinned dispatcher, not by URL rewriting.
    expect(requestUrl).toBe("https://cdn.example.com/ok.png");
    expect(options.headers.Host).toBeUndefined();
    expect(options.dispatcher).toBeDefined();
    expect(options.redirect).toBe("manual");
  });

  it("rejects when DNS resolves to a private IP (rebinding defense)", async () => {
    vi.mocked(lookup).mockResolvedValue({ address: "10.0.0.1", family: 4 } as never);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = await fetchImageAsDataUri("https://rebind.example.com/e.png", MAX_ICON_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("DNS rebinding");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects when DNS lookup fails", async () => {
    vi.mocked(lookup).mockRejectedValue(new Error("ENOTFOUND"));
    const result = await fetchImageAsDataUri("https://gone.example.com/e.png", MAX_ICON_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("DNS lookup failed");
  });

  it("rejects redirect responses", async () => {
    stubFetchResponse(null, {
      status: 302,
      headers: { location: "http://169.254.169.254/" },
    });
    const result = await fetchImageAsDataUri("https://cdn.example.com/r.png", MAX_ICON_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("Redirects are not followed");
  });

  it("rejects non-2xx responses", async () => {
    stubFetchResponse("nope", { status: 404, headers: { "content-type": "image/png" } });
    const result = await fetchImageAsDataUri("https://cdn.example.com/404.png", MAX_ICON_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("HTTP 404");
  });

  it("rejects non-image content types", async () => {
    stubFetchResponse("{}", { headers: { "content-type": "application/json" } });
    const result = await fetchImageAsDataUri("https://cdn.example.com/j.png", MAX_ICON_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('content-type "application/json"');
  });

  it("rejects bodies that exceed the cap even without a content-length header", async () => {
    const oversized = new Uint8Array(MAX_EMOJI_BYTES + 1);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(oversized);
        controller.close();
      },
    });
    stubFetchResponse(stream);
    const result = await fetchImageAsDataUri("https://cdn.example.com/big.png", MAX_EMOJI_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("exceeds");
  });

  it("rejects empty image bodies", async () => {
    stubFetchResponse(new Uint8Array(0));
    const result = await fetchImageAsDataUri("https://cdn.example.com/empty.png", MAX_ICON_BYTES);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("empty");
  });

  it("enforces the 2MB icon limit constant and 256KB emoji limit constant", () => {
    expect(MAX_ICON_BYTES).toBe(2 * 1024 * 1024);
    expect(MAX_EMOJI_BYTES).toBe(256 * 1024);
  });
});
