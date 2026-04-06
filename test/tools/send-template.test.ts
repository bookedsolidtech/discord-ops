import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendTemplate } from "../../src/tools/messaging/send-template.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

// Mock resolveTarget
vi.mock("../../src/routing/resolver.js", () => ({
  resolveTarget: vi.fn().mockResolvedValue({ channelId: "222222222222222222", token: undefined }),
}));

// Mock renderTemplate
vi.mock("../../src/templates/registry.js", () => ({
  renderTemplate: vi.fn().mockReturnValue({
    content: "Hello from template",
    embeds: [],
    components: undefined,
    poll: undefined,
  }),
}));

// Mock discord.js ActionRowBuilder/ButtonBuilder
vi.mock("discord.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("discord.js")>();
  const ButtonBuilderMock = vi.fn().mockImplementation(() => ({
    setLabel: vi.fn().mockReturnThis(),
    setStyle: vi.fn().mockReturnThis(),
    setURL: vi.fn().mockReturnThis(),
    setCustomId: vi.fn().mockReturnThis(),
    setEmoji: vi.fn().mockReturnThis(),
    setDisabled: vi.fn().mockReturnThis(),
  }));
  const ActionRowBuilderMock = vi.fn().mockImplementation(() => ({
    addComponents: vi.fn().mockReturnThis(),
  }));
  return {
    ...actual,
    ButtonBuilder: ButtonBuilderMock,
    ActionRowBuilder: ActionRowBuilderMock,
  };
});

function createCtx(): ToolContext {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig(),
  };
}

describe("send_template", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has correct metadata", () => {
    expect(sendTemplate.name).toBe("send_template");
    expect(sendTemplate.category).toBe("messaging");
  });

  it("sends a basic template message", async () => {
    const { renderTemplate } = await import("../../src/templates/registry.js");
    vi.mocked(renderTemplate).mockReturnValue({
      content: "Release note",
      embeds: [],
      components: undefined,
      poll: undefined,
    });

    const ctx = createCtx();
    const result = await sendTemplate.handle(
      { template: "release", vars: {}, project: "test-project", channel: "dev" },
      ctx,
    );

    expect(result.isError).toBeUndefined();
    const text = JSON.parse(result.content[0].text as string);
    expect(text.template).toBe("release");
  });

  it("returns error when resolveTarget fails", async () => {
    const { resolveTarget } = await import("../../src/routing/resolver.js");
    vi.mocked(resolveTarget).mockResolvedValue({ error: "No channel found" } as any);

    const ctx = createCtx();
    const result = await sendTemplate.handle({ template: "release", vars: {} }, ctx);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("No channel found");
  });

  it("includes has_components in result when components present", async () => {
    const { resolveTarget } = await import("../../src/routing/resolver.js");
    vi.mocked(resolveTarget).mockResolvedValue({
      channelId: "222222222222222222",
      token: undefined,
    } as any);

    const { renderTemplate } = await import("../../src/templates/registry.js");
    vi.mocked(renderTemplate).mockReturnValue({
      content: undefined,
      embeds: [],
      components: [
        {
          buttons: [{ label: "Click", style: "primary", custom_id: "btn1" }],
        },
      ],
      poll: undefined,
    });

    const ctx = createCtx();
    const result = await sendTemplate.handle({ template: "release", vars: {} }, ctx);

    expect(result.isError).toBeUndefined();
    const text = JSON.parse(result.content[0].text as string);
    expect(text.has_components).toBe(true);
  });

  it("includes has_poll in result when poll present", async () => {
    const { resolveTarget } = await import("../../src/routing/resolver.js");
    vi.mocked(resolveTarget).mockResolvedValue({
      channelId: "222222222222222222",
      token: undefined,
    } as any);

    const { renderTemplate } = await import("../../src/templates/registry.js");
    vi.mocked(renderTemplate).mockReturnValue({
      content: undefined,
      embeds: [],
      components: undefined,
      poll: {
        question: "Favorite color?",
        answers: [{ text: "Blue" }, { text: "Red", emoji: "❤️" }],
        duration: 48,
        allow_multiselect: true,
      },
    });

    const ctx = createCtx();
    const result = await sendTemplate.handle({ template: "poll", vars: {} }, ctx);

    expect(result.isError).toBeUndefined();
    const text = JSON.parse(result.content[0].text as string);
    expect(text.has_poll).toBe(true);
  });

  it("includes embed_count when multiple embeds", async () => {
    const { resolveTarget } = await import("../../src/routing/resolver.js");
    vi.mocked(resolveTarget).mockResolvedValue({
      channelId: "222222222222222222",
      token: undefined,
    } as any);

    const { renderTemplate } = await import("../../src/templates/registry.js");
    vi.mocked(renderTemplate).mockReturnValue({
      content: undefined,
      embeds: [{ title: "Embed 1" }, { title: "Embed 2" }],
      components: undefined,
      poll: undefined,
    });

    const ctx = createCtx();
    const result = await sendTemplate.handle({ template: "dashboard", vars: {} }, ctx);

    expect(result.isError).toBeUndefined();
    const text = JSON.parse(result.content[0].text as string);
    expect(text.embed_count).toBe(2);
  });

  it("handles link button style with url", async () => {
    const { resolveTarget } = await import("../../src/routing/resolver.js");
    vi.mocked(resolveTarget).mockResolvedValue({
      channelId: "222222222222222222",
      token: undefined,
    } as any);

    const { renderTemplate } = await import("../../src/templates/registry.js");
    vi.mocked(renderTemplate).mockReturnValue({
      content: "See details",
      embeds: [],
      components: [
        {
          buttons: [
            { label: "Open", style: "link", url: "https://example.com" },
            { label: "Action", style: "danger", custom_id: "action1", emoji: "🔥", disabled: true },
          ],
        },
      ],
      poll: undefined,
    });

    const ctx = createCtx();
    const result = await sendTemplate.handle({ template: "release", vars: {} }, ctx);

    expect(result.isError).toBeUndefined();
  });

  it("schema validates required fields", () => {
    const valid = sendTemplate.inputSchema.safeParse({ template: "release", vars: {} });
    expect(valid.success).toBe(true);

    const invalid = sendTemplate.inputSchema.safeParse({ vars: {} });
    expect(invalid.success).toBe(false);
  });
});
