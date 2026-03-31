import { describe, it, expect } from "vitest";
import { healthCheck } from "../../src/tools/health-check.js";
import { createMockDiscordClient, createMockConfig } from "../mocks/discord-client.js";
import type { ToolContext } from "../../src/tools/types.js";

describe("health_check", () => {
  it("returns status with project info", async () => {
    const ctx: ToolContext = {
      discord: createMockDiscordClient() as any,
      config: createMockConfig(),
    };

    const result = await healthCheck.handle({}, ctx);
    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0]!.text);
    expect(data.status).toBe("ok");
    expect(data.connected).toBe(true);
    expect(data.projects).toContain("test-project");
  });
});
