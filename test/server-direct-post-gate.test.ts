import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";

// Replace the registry with synthetic tools named like the real ones.
vi.mock("../src/tools/index.js", () => ({ allTools: [] }));

import { createServer } from "../src/server.js";
import type { ToolDefinition, ToolContext } from "../src/tools/types.js";

const { allTools } = await import("../src/tools/index.js");

function tool(name: string, extra: Partial<ToolDefinition> = {}): ToolDefinition {
  return {
    name,
    description: name,
    category: "messaging",
    inputSchema: z.object({ project: z.string().optional(), channel: z.string().optional() }),
    handle: vi.fn().mockResolvedValue({ content: [{ type: "text", text: `${name} ran` }] }),
    ...extra,
  } as ToolDefinition;
}

function ctx(requireApproval?: boolean): ToolContext {
  return {
    discord: {} as any,
    config: {
      defaultToken: "x".repeat(60),
      global: {
        projects: {
          "strawn-games": {
            guild_id: "444444444444444444",
            channels: { general: "200000000000000001" },
            ...(requireApproval === undefined
              ? {}
              : { posts: { require_approval: requireApproval } }),
          },
        },
      },
    } as any,
  };
}

function handler(server: ReturnType<typeof createServer>["server"], name: string) {
  return (server as any)._registeredTools[name].handler as (
    p: Record<string, unknown>,
  ) => Promise<any>;
}

describe("server require_approval gate", () => {
  beforeEach(() => {
    allTools.length = 0;
  });

  it("refuses a direct-post tool for a require_approval project before it runs", async () => {
    const send = tool("send_message");
    allTools.push(send);
    const { server } = createServer(ctx(true), { profile: "full" });
    const result = await handler(
      server,
      "send_message",
    )({ project: "strawn-games", channel: "general" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/require_approval.*preview_post/);
    expect(send.handle).not.toHaveBeenCalled();
  });

  it.each([undefined, false])("runs the tool when require_approval is %s", async (flag) => {
    const send = tool("send_message");
    allTools.push(send);
    const { server } = createServer(ctx(flag));
    const result = await handler(
      server,
      "send_message",
    )({ project: "strawn-games", channel: "general" });
    expect(result.isError).toBeFalsy();
    expect(send.handle).toHaveBeenCalled();
  });

  it("still runs preview_post and publish_post when require_approval is set", async () => {
    const preview = tool("preview_post", { gatesOwnChannels: true });
    const publish = tool("publish_post", { gatesOwnChannels: true });
    allTools.push(preview, publish);
    const { server } = createServer(ctx(true));
    for (const name of ["preview_post", "publish_post"]) {
      const result = await handler(server, name)({ project: "strawn-games" });
      expect(result.isError).toBeFalsy();
    }
    expect(preview.handle).toHaveBeenCalled();
    expect(publish.handle).toHaveBeenCalled();
  });
});
