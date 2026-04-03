import { describe, it, expect, vi } from "vitest";
import { archiveThread } from "../../src/tools/threads/archive.js";
import {
  createMockDiscordClient,
  createMockChannel,
  createMockConfig,
} from "../mocks/discord-client.js";

function createCtx() {
  return {
    discord: createMockDiscordClient() as any,
    config: createMockConfig() as any,
  };
}

describe("archive_thread", () => {
  it("has correct metadata", () => {
    expect(archiveThread.name).toBe("archive_thread");
    expect(archiveThread.category).toBe("threads");
    expect(archiveThread.permissions).toContain("ManageThreads");
  });

  it("archives a thread", async () => {
    const ctx = createCtx();
    const mockThread = createMockChannel({
      id: "555555555555555555",
      name: "test-thread",
      isThread: () => true,
      setArchived: vi.fn().mockResolvedValue(undefined),
      setLocked: vi.fn().mockResolvedValue(undefined),
    });
    (ctx.discord.getAnyChannel as any).mockResolvedValue(mockThread);

    const result = await archiveThread.handle(
      { thread_id: "555555555555555555", locked: false },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("Archived");
    expect(mockThread.setArchived).toHaveBeenCalledWith(true);
    expect(mockThread.setLocked).not.toHaveBeenCalled();
  });

  it("archives and locks a thread", async () => {
    const ctx = createCtx();
    const mockThread = createMockChannel({
      id: "555555555555555555",
      name: "test-thread",
      isThread: () => true,
      setArchived: vi.fn().mockResolvedValue(undefined),
      setLocked: vi.fn().mockResolvedValue(undefined),
    });
    (ctx.discord.getAnyChannel as any).mockResolvedValue(mockThread);

    const result = await archiveThread.handle(
      { thread_id: "555555555555555555", locked: true },
      ctx,
    );

    expect(result.isError).toBeFalsy();
    expect(result.content[0].text).toContain("locked");
    expect(mockThread.setArchived).toHaveBeenCalledWith(true);
    expect(mockThread.setLocked).toHaveBeenCalledWith(true);
  });

  it("errors on non-thread channel", async () => {
    const ctx = createCtx();
    const mockChannel = createMockChannel({
      id: "222222222222222222",
      isThread: () => false,
    });
    (ctx.discord.getAnyChannel as any).mockResolvedValue(mockChannel);

    const result = await archiveThread.handle(
      { thread_id: "222222222222222222", locked: false },
      ctx,
    );

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("not a thread");
  });
});
