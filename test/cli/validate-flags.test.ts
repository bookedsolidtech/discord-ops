import { describe, it, expect } from "vitest";
import { validateFlags } from "../../src/cli/validate-flags.js";

describe("validateFlags", () => {
  it("passes for no flags", () => {
    expect(() => validateFlags([])).not.toThrow();
  });

  it("passes for known flags", () => {
    expect(() => validateFlags(["--help"])).not.toThrow();
    expect(() => validateFlags(["--version"])).not.toThrow();
    expect(() => validateFlags(["serve", "--port", "8080"])).not.toThrow();
    expect(() => validateFlags(["serve", "--allowed-origin", "https://example.com"])).not.toThrow();
  });

  it("passes for short flags (-h, -v) which are not -- prefixed", () => {
    expect(() => validateFlags(["-h"])).not.toThrow();
    expect(() => validateFlags(["-v"])).not.toThrow();
  });

  it("throws for an unknown --flag", () => {
    expect(() => validateFlags(["--foo"])).toThrowError(/Unknown flag: --foo/);
  });

  it("error message lists valid flags", () => {
    expect(() => validateFlags(["--unknown"])).toThrowError(/Valid flags:/);
  });

  it("throws for an unknown flag mixed with known ones", () => {
    expect(() => validateFlags(["--port", "9000", "--bogus"])).toThrowError(
      /Unknown flag: --bogus/,
    );
  });

  it("stops scanning at -- separator and does not throw for flags after it", () => {
    expect(() => validateFlags(["--", "--unknown-after-separator"])).not.toThrow();
  });

  it("does not throw for subcommand words (non-flag args)", () => {
    expect(() => validateFlags(["serve", "health"])).not.toThrow();
  });
});
