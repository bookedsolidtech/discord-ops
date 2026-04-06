import { describe, it, expect, vi, beforeEach } from "vitest";
import { auditToolCall } from "../../src/security/audit.js";
import { logger } from "../../src/utils/logger.js";

vi.mock("../../src/utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
  },
}));

function getLoggedParams() {
  const calls = (logger.info as ReturnType<typeof vi.fn>).mock.calls;
  return calls[calls.length - 1]?.[1]?.params;
}

describe("redactSensitiveParams — array recursion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redacts token key inside array of objects", () => {
    auditToolCall({
      tool: "test_tool",
      params: {
        embeds: [{ title: "hello", token: "secret-token-value" }],
      },
      durationMs: 1,
      success: true,
    });
    const params = getLoggedParams();
    expect((params.embeds as any[])[0].token).toBe("[REDACTED]");
    expect((params.embeds as any[])[0].title).toBe("hello");
  });

  it("redacts webhook_url inside array of objects", () => {
    auditToolCall({
      tool: "test_tool",
      params: {
        hooks: [{ webhook_url: "https://discord.com/api/webhooks/123/abc" }],
      },
      durationMs: 1,
      success: true,
    });
    const params = getLoggedParams();
    expect((params.hooks as any[])[0].webhook_url).toBe("[REDACTED]");
  });

  it("handles arrays of arrays (nested arrays)", () => {
    auditToolCall({
      tool: "test_tool",
      params: {
        matrix: [[{ token: "nested" }]],
      },
      durationMs: 1,
      success: true,
    });
    const params = getLoggedParams();
    expect((params.matrix as any[][])[0][0].token).toBe("[REDACTED]");
  });

  it("does not alter non-sensitive keys in array objects", () => {
    auditToolCall({
      tool: "test_tool",
      params: {
        items: [{ name: "foo", value: "bar" }],
      },
      durationMs: 1,
      success: true,
    });
    const params = getLoggedParams();
    expect((params.items as any[])[0].name).toBe("foo");
    expect((params.items as any[])[0].value).toBe("bar");
  });

  it("still redacts top-level sensitive keys", () => {
    auditToolCall({
      tool: "test_tool",
      params: { token: "top-level-secret" },
      durationMs: 1,
      success: true,
    });
    const params = getLoggedParams();
    expect(params.token).toBe("[REDACTED]");
  });

  it("recurses into plain nested objects", () => {
    auditToolCall({
      tool: "test_tool",
      params: { nested: { token: "deep-secret" } },
      durationMs: 1,
      success: true,
    });
    const params = getLoggedParams();
    expect((params.nested as any).token).toBe("[REDACTED]");
  });
});
