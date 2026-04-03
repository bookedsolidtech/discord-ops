import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { z } from "zod";

// Mock allTools so we inject a synthetic tool definition for each test.
vi.mock("../src/tools/index.js", () => ({ allTools: [] }));

// Mock checkPermissions so we control its return value.
vi.mock("../src/security/permissions.js", () => ({
  checkPermissions: vi.fn(),
}));

// Mock getTokenForProject so it never throws in these tests.
vi.mock("../src/config/index.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/config/index.js")>();
  return {
    ...actual,
    getTokenForProject: vi.fn().mockReturnValue("mock-token"),
  };
});

import { createServer } from "../src/server.js";
import { checkPermissions } from "../src/security/permissions.js";
import {
  createMockDiscordClient,
  createMockConfig,
  createMockGuild,
} from "./mocks/discord-client.js";
import type { ToolDefinition, ToolContext } from "../src/tools/types.js";

// Access allTools array from the mocked module so we can push tools in each test.
const { allTools } = await import("../src/tools/index.js");

// Helper: pull the registered handler for a named tool out of the MCP server.
function getHandler(server: ReturnType<typeof createServer>["server"], toolName: string) {
  const registered = (server as any)._registeredTools[toolName];
  if (!registered) throw new Error(`Tool "${toolName}" not found in registered tools`);
  return registered.handler as (params: Record<string, unknown>) => Promise<unknown>;
}

// Minimal valid snowflake-shaped IDs used throughout.
const GUILD_ID = "444444444444444444";
const CHANNEL_ID = "222222222222222222";

// Build a synthetic tool with given overrides.
function makeTool(overrides: Partial<ToolDefinition>): ToolDefinition {
  return {
    name: "test_perm_tool",
    description: "synthetic tool for perm pre-check tests",
    category: "test",
    inputSchema: z.object({
      guild_id: z.string().optional(),
      channel_id: z.string().optional(),
    }),
    requiresGuild: true,
    permissions: ["ManageChannels"],
    handle: vi.fn().mockResolvedValue({
      content: [{ type: "text", text: "handle called" }],
    }),
    ...overrides,
  } as ToolDefinition;
}

function createCtx(discordOverrides: Record<string, unknown> = {}): ToolContext {
  return {
    discord: createMockDiscordClient(discordOverrides) as any,
    config: createMockConfig() as any,
  };
}

describe("server perm pre-check", () => {
  beforeEach(() => {
    // Reset allTools to empty before each test so registrations don't collide.
    allTools.length = 0;
    vi.mocked(checkPermissions).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("fires via guild_id — allowed — handle is called", async () => {
    vi.mocked(checkPermissions).mockReturnValue({ allowed: true, missing: [] });

    const tool = makeTool({});
    allTools.push(tool);

    const mockGuild = createMockGuild();
    const ctx = createCtx({ getGuild: vi.fn().mockResolvedValue(mockGuild) });

    const { server } = createServer(ctx);
    const handler = getHandler(server, "test_perm_tool");

    const result = (await handler({ guild_id: GUILD_ID })) as any;

    expect(ctx.discord.getGuild).toHaveBeenCalledWith(GUILD_ID, undefined);
    expect(mockGuild.members.fetchMe).toHaveBeenCalled();
    expect(checkPermissions).toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
    expect(tool.handle).toHaveBeenCalled();
  });

  it("fires via channel_id — allowed — handle is called", async () => {
    vi.mocked(checkPermissions).mockReturnValue({ allowed: true, missing: [] });

    const tool = makeTool({});
    allTools.push(tool);

    const mockGuild = createMockGuild();
    const mockChannel = { id: CHANNEL_ID, name: "test-ch", guild: { id: GUILD_ID } };
    const ctx = createCtx({
      getAnyChannel: vi.fn().mockResolvedValue(mockChannel),
      getGuild: vi.fn().mockResolvedValue(mockGuild),
    });

    const { server } = createServer(ctx);
    const handler = getHandler(server, "test_perm_tool");

    // No guild_id — only channel_id provided.
    const result = (await handler({ channel_id: CHANNEL_ID })) as any;

    expect(ctx.discord.getAnyChannel).toHaveBeenCalledWith(CHANNEL_ID, undefined);
    expect(ctx.discord.getGuild).toHaveBeenCalledWith(GUILD_ID, undefined);
    expect(mockGuild.members.fetchMe).toHaveBeenCalled();
    expect(checkPermissions).toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
    expect(tool.handle).toHaveBeenCalled();
  });

  it("returns isError when checkPermissions returns missing permissions", async () => {
    vi.mocked(checkPermissions).mockReturnValue({
      allowed: false,
      missing: ["ManageChannels"],
    });

    const tool = makeTool({});
    allTools.push(tool);

    const mockGuild = createMockGuild();
    const ctx = createCtx({ getGuild: vi.fn().mockResolvedValue(mockGuild) });

    const { server } = createServer(ctx);
    const handler = getHandler(server, "test_perm_tool");

    const result = (await handler({ guild_id: GUILD_ID })) as any;

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("ManageChannels");
    expect(tool.handle).not.toHaveBeenCalled();
  });

  it("swallows guild lookup errors and still calls the tool handle", async () => {
    // checkPermissions should never be reached in this case.
    vi.mocked(checkPermissions).mockReturnValue({ allowed: true, missing: [] });

    const tool = makeTool({});
    allTools.push(tool);

    const ctx = createCtx({
      getGuild: vi.fn().mockRejectedValue(new Error("Guild not cached")),
    });

    const { server } = createServer(ctx);
    const handler = getHandler(server, "test_perm_tool");

    const result = (await handler({ guild_id: GUILD_ID })) as any;

    // The catch block swallows the error — handle must still be invoked.
    expect(result.isError).toBeFalsy();
    expect(tool.handle).toHaveBeenCalled();
  });

  it("skips pre-check entirely when requiresGuild is absent", async () => {
    const tool = makeTool({ requiresGuild: undefined });
    allTools.push(tool);

    const mockGetGuild = vi.fn();
    const ctx = createCtx({ getGuild: mockGetGuild });

    const { server } = createServer(ctx);
    const handler = getHandler(server, "test_perm_tool");

    const result = (await handler({ guild_id: GUILD_ID })) as any;

    expect(mockGetGuild).not.toHaveBeenCalled();
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
    expect(tool.handle).toHaveBeenCalled();
  });

  it("skips pre-check entirely when permissions array is empty", async () => {
    const tool = makeTool({ permissions: [] });
    allTools.push(tool);

    const mockGetGuild = vi.fn();
    const ctx = createCtx({ getGuild: mockGetGuild });

    const { server } = createServer(ctx);
    const handler = getHandler(server, "test_perm_tool");

    const result = (await handler({ guild_id: GUILD_ID })) as any;

    expect(mockGetGuild).not.toHaveBeenCalled();
    expect(checkPermissions).not.toHaveBeenCalled();
    expect(result.isError).toBeFalsy();
    expect(tool.handle).toHaveBeenCalled();
  });
});
