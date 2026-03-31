import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createServer } from "../../src/server.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";

describe("dry-run mode", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("creates server with dry-run option", () => {
    const ctx = {
      discord: createMockDiscordClient() as any,
      config: createMockConfig() as any,
    };

    const server = createServer(ctx, { dryRun: true });
    expect(server).toBeDefined();
  });

  it("creates server with DISCORD_OPS_DRY_RUN env var", () => {
    process.env.DISCORD_OPS_DRY_RUN = "true";

    const ctx = {
      discord: createMockDiscordClient() as any,
      config: createMockConfig() as any,
    };

    const server = createServer(ctx);
    expect(server).toBeDefined();
  });

  it("creates server with DRY_RUN env var", () => {
    process.env.DRY_RUN = "1";

    const ctx = {
      discord: createMockDiscordClient() as any,
      config: createMockConfig() as any,
    };

    const server = createServer(ctx);
    expect(server).toBeDefined();
  });
});
