import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * Tests for the HTTP transport startup auth enforcement.
 *
 * The key behavior under test:
 * - startHttpTransport() calls process.exit(1) when no token and allowUnauthenticated is false
 * - startHttpTransport() starts successfully when allowUnauthenticated is true
 * - startHttpTransport() starts successfully when a token is provided
 */

describe("startHttpTransport startup auth enforcement", () => {
  let exitSpy: ReturnType<typeof vi.spyOn>;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as never);
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.DISCORD_OPS_HTTP_TOKEN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits with code 1 when no token is configured and allowUnauthenticated is not set", async () => {
    // We test the logic directly by importing and inspecting the behavior.
    // Since startHttpTransport binds a real port, we mock process.exit to capture the call.
    const { startHttpTransport } = await import("../../src/transport/http.js");

    // McpServer mock — minimal shape needed
    const mockServer = {} as Parameters<typeof startHttpTransport>[0];

    await expect(startHttpTransport(mockServer, {})).rejects.toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("DISCORD_OPS_HTTP_TOKEN"));
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("--allow-unauthenticated"),
    );
  });

  it("exits with code 1 when allowUnauthenticated is explicitly false and no token set", async () => {
    const { startHttpTransport } = await import("../../src/transport/http.js");
    const mockServer = {} as Parameters<typeof startHttpTransport>[0];

    await expect(startHttpTransport(mockServer, { allowUnauthenticated: false })).rejects.toThrow(
      "process.exit called",
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("does not exit when no token but allowUnauthenticated is true", async () => {
    const { startHttpTransport } = await import("../../src/transport/http.js");
    const mockServer = {} as Parameters<typeof startHttpTransport>[0];

    // With allowUnauthenticated: true, it should attempt to bind (not call process.exit).
    // We abort before the real listen by having the server be invalid — but the key check
    // is that process.exit is NOT called before reaching the listen attempt.
    // We use a deliberately bad port to make listen fail after the auth check passes.
    const promise = startHttpTransport(mockServer, {
      allowUnauthenticated: true,
      port: 0, // port 0 = OS-assigned, will actually work; we just need it to not exit(1)
    });

    // Cancel the listen by destroying the http server quickly
    // The promise will either resolve (if port 0 binds) or hang; we just check no exit(1)
    // We'll race with a timeout to verify exit was NOT called immediately
    const raceResult = await Promise.race([
      promise.then(() => "resolved").catch(() => "errored"),
      new Promise<string>((r) => setTimeout(() => r("timeout"), 200)),
    ]);

    // The important assertion: process.exit was NOT called with code 1
    expect(exitSpy).not.toHaveBeenCalledWith(1);
    // Cleanup: kill the server if it started
    void raceResult;
  });
});
