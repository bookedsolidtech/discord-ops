import { describe, it, expect } from "vitest";
import { sanitizeError } from "../../src/security/sanitizer.js";

describe("sanitizeError", () => {
  it("strips token fragments", () => {
    const msg = "Auth failed with token XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX0000";
    const sanitized = sanitizeError(msg);
    expect(sanitized).not.toContain("XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX");
    expect(sanitized).toContain("[REDACTED_TOKEN]");
  });

  it("strips webhook URLs", () => {
    const msg = "Webhook https://discord.com/api/webhooks/123456789012345678/abcdefABCDEF failed";
    const sanitized = sanitizeError(msg);
    expect(sanitized).not.toContain("webhooks");
    expect(sanitized).toContain("[REDACTED_WEBHOOK_URL]");
  });

  it("handles Error objects", () => {
    const err = new Error("Something went wrong");
    expect(sanitizeError(err)).toBe("Something went wrong");
  });

  it("handles unknown types", () => {
    expect(sanitizeError(42)).toBe("An unknown error occurred");
  });
});
