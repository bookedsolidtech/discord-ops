import { describe, it, expect } from "vitest";
import { notifyOwners } from "../../src/tools/messaging/notify-owners.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

const OWNER_ID = "820027414902079548";

function createCtx(notifyOn: string[] = ["error", "alert", "release"]): ToolContext {
  const config = createMockConfig();
  config.global.projects["test-project"] = {
    ...config.global.projects["test-project"],
    owners: [OWNER_ID],
    notify_owners_on: notifyOn as any,
  };
  return { discord: createMockDiscordClient() as any, config };
}

describe("notify_owners", () => {
  it("has correct metadata", () => {
    expect(notifyOwners.name).toBe("notify_owners");
    expect(notifyOwners.category).toBe("messaging");
  });

  it("sends owner mention when notification_type matches", async () => {
    const ctx = createCtx();
    const result = await notifyOwners.handle(
      { project: "test-project", notification_type: "error", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.mentions).toContain(`<@${OWNER_ID}>`);
    expect(data.notification_type).toBe("error");
    expect(data.project).toBe("test-project");
  });

  it("sends mention to correct channel via project routing", async () => {
    const ctx = createCtx();
    await notifyOwners.handle(
      { project: "test-project", notification_type: "alert", channel: "dev" },
      ctx,
    );
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("222222222222222222", expect.anything());
  });

  it("appends optional message after mentions", async () => {
    const ctx = createCtx();
    await notifyOwners.handle(
      {
        project: "test-project",
        notification_type: "error",
        channel: "dev",
        message: "Deploy failed on prod",
      },
      ctx,
    );
    const mockChannel = await ctx.discord.getChannel("222222222222222222");
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("Deploy failed on prod"),
      }),
    );
    expect(mockChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(`<@${OWNER_ID}>`),
      }),
    );
  });

  it("no-ops silently when notification_type not in notify_owners_on", async () => {
    const ctx = createCtx(["error"]);
    const result = await notifyOwners.handle(
      { project: "test-project", notification_type: "release", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("No ping sent");
    expect(ctx.discord.getChannel).not.toHaveBeenCalled();
  });

  it("never pings on notification_type dev regardless of config", async () => {
    const ctx = createCtx(["dev", "error"]);
    const result = await notifyOwners.handle(
      { project: "test-project", notification_type: "dev", channel: "dev" },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(result.content[0]!.text).toContain("No ping sent");
    expect(ctx.discord.getChannel).not.toHaveBeenCalled();
  });

  it("no-ops when project has no owners configured", async () => {
    const ctx = createCtx();
    ctx.config.global.projects["test-project"].owners = [];
    const result = await notifyOwners.handle(
      { project: "test-project", notification_type: "error", channel: "dev" },
      ctx,
    );
    expect(result.content[0]!.text).toContain("No ping sent");
  });

  it("routes via direct channel_id", async () => {
    const ctx = createCtx();
    const result = await notifyOwners.handle(
      {
        project: "test-project",
        notification_type: "error",
        channel_id: "999999999999999999",
      },
      ctx,
    );
    expect(result.isError).toBeUndefined();
    expect(ctx.discord.getChannel).toHaveBeenCalledWith("999999999999999999", expect.anything());
  });

  it("schema requires project and notification_type", () => {
    expect(notifyOwners.inputSchema.safeParse({}).success).toBe(false);
    expect(notifyOwners.inputSchema.safeParse({ project: "test-project" }).success).toBe(false);
    expect(
      notifyOwners.inputSchema.safeParse({
        project: "test-project",
        notification_type: "error",
      }).success,
    ).toBe(true);
  });

  it("schema rejects invalid notification_type", () => {
    const result = notifyOwners.inputSchema.safeParse({
      project: "test-project",
      notification_type: "invalid-type",
    });
    expect(result.success).toBe(false);
  });

  it("schema rejects message over 1800 chars", () => {
    const result = notifyOwners.inputSchema.safeParse({
      project: "test-project",
      notification_type: "error",
      message: "x".repeat(1801),
    });
    expect(result.success).toBe(false);
  });
});
