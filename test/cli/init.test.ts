import { describe, it, expect } from "vitest";
import { writeFileSync, unlinkSync, existsSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseChannelArgs, parseInitArgs, buildInitConfig } from "../../src/cli/init.js";

// ---------------------------------------------------------------------------
// parseChannelArgs
// ---------------------------------------------------------------------------

describe("parseChannelArgs", () => {
  it("returns an empty record when no channel args are supplied", () => {
    const result = parseChannelArgs([]);
    expect(result).toEqual({});
  });

  it("parses a single valid alias=id pair", () => {
    const result = parseChannelArgs(["builds=123456789012345678"]);
    expect(result).toEqual({ builds: "123456789012345678" });
  });

  it("parses multiple valid alias=id pairs", () => {
    const result = parseChannelArgs(["builds=123456789012345678", "alerts=987654321098765432"]);
    expect(result).toEqual({
      builds: "123456789012345678",
      alerts: "987654321098765432",
    });
  });

  it("returns an error string when the id is not a snowflake", () => {
    const result = parseChannelArgs(["builds=not-a-snowflake"]);
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/not a valid Discord snowflake/i);
  });

  it("returns an error string when there is no equals sign", () => {
    const result = parseChannelArgs(["builds"]);
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/expected format/i);
  });

  it("returns an error string when the alias is empty", () => {
    const result = parseChannelArgs(["=123456789012345678"]);
    expect(typeof result).toBe("string");
    expect(result as string).toMatch(/alias cannot be empty/i);
  });
});

// ---------------------------------------------------------------------------
// parseInitArgs
// ---------------------------------------------------------------------------

describe("parseInitArgs", () => {
  it("throws when --project is missing", () => {
    expect(() => parseInitArgs(["--guild-id", "444444444444444444"])).toThrow(
      /--project .* is required/i,
    );
  });

  it("throws when --guild-id is missing", () => {
    expect(() => parseInitArgs(["--project", "my-app"])).toThrow(/--guild-id .* is required/i);
  });

  it("throws when both required flags are missing", () => {
    expect(() => parseInitArgs([])).toThrow();
  });

  it("returns defaults for optional flags when not supplied", () => {
    const opts = parseInitArgs(["--project", "my-app", "--guild-id", "444444444444444444"]);
    expect(opts.tokenEnv).toBe("DISCORD_TOKEN");
    expect(opts.channels).toEqual({});
    expect(opts.force).toBe(false);
    expect(opts.markDefault).toBe(false);
  });

  it("parses --token-env override", () => {
    const opts = parseInitArgs([
      "--project",
      "my-app",
      "--guild-id",
      "444444444444444444",
      "--token-env",
      "MY_BOT_TOKEN",
    ]);
    expect(opts.tokenEnv).toBe("MY_BOT_TOKEN");
  });

  it("parses --force flag", () => {
    const opts = parseInitArgs([
      "--project",
      "my-app",
      "--guild-id",
      "444444444444444444",
      "--force",
    ]);
    expect(opts.force).toBe(true);
  });

  it("parses --default flag", () => {
    const opts = parseInitArgs([
      "--project",
      "my-app",
      "--guild-id",
      "444444444444444444",
      "--default",
    ]);
    expect(opts.markDefault).toBe(true);
  });

  it("parses multiple --channel pairs", () => {
    const opts = parseInitArgs([
      "--project",
      "my-app",
      "--guild-id",
      "444444444444444444",
      "--channel",
      "builds=123456789012345678",
      "--channel",
      "alerts=987654321098765432",
    ]);
    expect(opts.channels).toEqual({
      builds: "123456789012345678",
      alerts: "987654321098765432",
    });
  });

  it("throws when a --channel value is malformed", () => {
    expect(() =>
      parseInitArgs([
        "--project",
        "my-app",
        "--guild-id",
        "444444444444444444",
        "--channel",
        "builds=not-a-snowflake",
      ]),
    ).toThrow(/not a valid Discord snowflake/i);
  });
});

// ---------------------------------------------------------------------------
// buildInitConfig
// ---------------------------------------------------------------------------

describe("buildInitConfig", () => {
  // Use a temp directory path that does not exist on disk so existsSync is false
  const nonExistentDir = "/tmp/__discord_ops_init_test_does_not_exist__";

  it("builds a valid GlobalConfig from minimal options", () => {
    const { config } = buildInitConfig({
      project: "my-app",
      guildId: "444444444444444444",
      tokenEnv: "DISCORD_TOKEN",
      channels: {},
      force: false,
      markDefault: false,
      cwd: nonExistentDir,
    });

    expect(config.projects["my-app"]).toBeDefined();
    expect(config.projects["my-app"]!.guild_id).toBe("444444444444444444");
    expect(config.projects["my-app"]!.token_env).toBe("DISCORD_TOKEN");
    expect(config.projects["my-app"]!.channels).toEqual({});
    expect(config.default_project).toBeUndefined();
  });

  it("sets default_project when markDefault is true", () => {
    const { config } = buildInitConfig({
      project: "my-app",
      guildId: "444444444444444444",
      tokenEnv: "DISCORD_TOKEN",
      channels: {},
      force: false,
      markDefault: true,
      cwd: nonExistentDir,
    });

    expect(config.default_project).toBe("my-app");
  });

  it("includes channel aliases in the config", () => {
    const { config } = buildInitConfig({
      project: "my-app",
      guildId: "444444444444444444",
      tokenEnv: "DISCORD_TOKEN",
      channels: { builds: "123456789012345678", alerts: "987654321098765432" },
      force: false,
      markDefault: false,
      cwd: nonExistentDir,
    });

    expect(config.projects["my-app"]!.channels).toEqual({
      builds: "123456789012345678",
      alerts: "987654321098765432",
    });
  });

  it("throws when the config file already exists and --force is not set", () => {
    // Create a real temp dir and pre-write the config file
    const tempDir = mkdtempSync(join(tmpdir(), "discord-ops-init-test-"));
    const configPath = join(tempDir, ".discord-ops.json");
    writeFileSync(configPath, "{}", "utf-8");

    try {
      expect(() =>
        buildInitConfig({
          project: "my-app",
          guildId: "444444444444444444",
          tokenEnv: "DISCORD_TOKEN",
          channels: {},
          force: false,
          markDefault: false,
          cwd: tempDir,
        }),
      ).toThrow(/already exists/i);
    } finally {
      if (existsSync(configPath)) unlinkSync(configPath);
    }
  });

  it("does not throw when the config file exists but --force is set", () => {
    // Create a real temp dir and pre-write the config file
    const tempDir = mkdtempSync(join(tmpdir(), "discord-ops-init-test-"));
    const configPath = join(tempDir, ".discord-ops.json");
    writeFileSync(configPath, "{}", "utf-8");

    try {
      expect(() =>
        buildInitConfig({
          project: "my-app",
          guildId: "444444444444444444",
          tokenEnv: "DISCORD_TOKEN",
          channels: {},
          force: true,
          markDefault: false,
          cwd: tempDir,
        }),
      ).not.toThrow();
    } finally {
      if (existsSync(configPath)) unlinkSync(configPath);
    }
  });

  it("throws a ZodError when the guild_id is not a valid snowflake", () => {
    expect(() =>
      buildInitConfig({
        project: "my-app",
        guildId: "not-a-snowflake",
        tokenEnv: "DISCORD_TOKEN",
        channels: {},
        force: false,
        markDefault: false,
        cwd: nonExistentDir,
      }),
    ).toThrow();
  });

  it("returns the correct filePath", () => {
    const { filePath } = buildInitConfig({
      project: "my-app",
      guildId: "444444444444444444",
      tokenEnv: "DISCORD_TOKEN",
      channels: {},
      force: false,
      markDefault: false,
      cwd: nonExistentDir,
    });

    expect(filePath).toBe(`${nonExistentDir}/.discord-ops.json`);
  });
});
