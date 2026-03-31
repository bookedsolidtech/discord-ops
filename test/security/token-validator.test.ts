import { describe, it, expect } from "vitest";
import { validateTokenFormat } from "../../src/security/token-validator.js";

describe("validateTokenFormat", () => {
  it("accepts valid token format", () => {
    const result = validateTokenFormat(
      "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX.XXXXXX.XXXXXXXXXXXXXXXXXXXXXXXXXXX0000",
    );
    expect(result.valid).toBe(true);
  });

  it("rejects empty string", () => {
    const result = validateTokenFormat("");
    expect(result.valid).toBe(false);
  });

  it("rejects short token", () => {
    const result = validateTokenFormat("too-short");
    expect(result.valid).toBe(false);
  });

  it("rejects wrong format", () => {
    const result = validateTokenFormat("a".repeat(60));
    expect(result.valid).toBe(false);
  });
});
