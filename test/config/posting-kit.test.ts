import { describe, it, expect } from "vitest";
import { ProjectConfigSchema, type ProjectConfig } from "../../src/config/schema.js";
import { validatePostingKit } from "../../src/config/validate.js";
import { profileGateError } from "../../src/config/tool-gate.js";
import {
  applyPresetEmbedDefaults,
  findPreset,
  resolvePostsConfig,
  serializePresets,
} from "../../src/config/personas.js";

const base = {
  guild_id: "444444444444444444",
  channels: { "feed-preview": "500000000000000001", welcome: "500000000000000002" },
};

function parse(extra: Record<string, unknown>) {
  return ProjectConfigSchema.safeParse({ ...base, ...extra });
}

describe("persona preset schema", () => {
  it("accepts a full preset and a name-only preset", () => {
    const result = parse({
      personas: {
        meelah: {
          name: "Meelah",
          avatar_url: "https://cdn.example.com/m.png",
          color: 0xff66cc,
          footer: "Meelah Says",
          default_channel: "welcome",
        },
        sprout: { name: "Sprout" },
      },
    });
    expect(result.success).toBe(true);
  });

  it.each([
    [{ name: "Admin" }, /Reserved persona name/],
    [{ name: "  moderator " }, /Reserved persona name/],
    [{ name: "Discord Helper" }, /clyde|discord/],
    [{ name: "" }, /./],
    [{ name: "x".repeat(81) }, /./],
    [{ name: "Ok", avatar_url: "https://10.0.0.1/a.png" }, /public/],
    [{ name: "Ok", avatar_url: "not a url" }, /./],
    [{ name: "Ok", color: 0x1000000 }, /./],
    [{ name: "Ok", color: -1 }, /./],
    [{ name: "Ok", color: 1.5 }, /./],
    [{ name: "Ok", footer: "f".repeat(2049) }, /./],
  ])("rejects bad preset %j", (preset, message) => {
    const result = parse({ personas: { bad: preset } });
    expect(result.success).toBe(false);
    expect(result.error!.message).toMatch(message);
  });

  it("rejects an unknown auto_types type, a non-boolean require_approval, and a bad approver id", () => {
    expect(parse({ posts: { auto_types: ["anouncement"] } }).success).toBe(false);
    expect(parse({ posts: { require_approval: "yes" } }).success).toBe(false);
    expect(
      parse({ posts: { auto_types: ["server_status"], require_approval: true } }).success,
    ).toBe(true);
    expect(parse({ posts: { approver_user_ids: ["123"] } }).success).toBe(false);
  });
});

describe("findPreset", () => {
  const project = {
    personas: {
      "counting-cubes": { name: "Counting Cubes" },
      meelah: { name: "Meelah" },
      odd: { name: "meelah-ish" },
    },
  } as Pick<ProjectConfig, "personas">;

  it("matches key and name case-insensitively", () => {
    expect(findPreset(project, "COUNTING-CUBES")?.key).toBe("counting-cubes");
    expect(findPreset(project, "counting cubes")?.key).toBe("counting-cubes");
    expect(findPreset(project, " Meelah ")?.key).toBe("meelah");
  });

  it("returns undefined for unknown names and missing presets", () => {
    expect(findPreset(project, "Sculk King")).toBeUndefined();
    expect(findPreset(undefined, "Meelah")).toBeUndefined();
    expect(findPreset(project, "   ")).toBeUndefined();
  });

  it("prefers a key match over a name match", () => {
    const clash = {
      personas: { a: { name: "b" }, b: { name: "Bee" } },
    } as Pick<ProjectConfig, "personas">;
    expect(findPreset(clash, "b")?.key).toBe("b");
  });
});

describe("serializePresets", () => {
  it("reports has_avatar instead of the URL", () => {
    const out = serializePresets({
      personas: { m: { name: "Meelah", avatar_url: "https://cdn.example.com/m.png", color: 1 } },
    });
    expect(out).toEqual([
      { key: "m", name: "Meelah", has_avatar: true, color: 1, default_channel: null },
    ]);
    expect(JSON.stringify(out)).not.toContain("cdn.example.com");
  });
});

describe("resolvePostsConfig", () => {
  it("applies defaults", () => {
    expect(resolvePostsConfig({})).toEqual({
      previewChannel: "feed-preview",
      approverUserIds: [],
      approverRoleIds: [],
      autoTypes: [],
      requireApproval: false,
    });
  });

  it("reads auto_types and require_approval", () => {
    const posts = resolvePostsConfig({
      posts: { auto_types: ["server_status", "server_status"], require_approval: true },
    });
    expect(posts.autoTypes).toEqual(["server_status"]);
    expect(posts.requireApproval).toBe(true);
  });

  it("unions approver ids with owners", () => {
    const posts = resolvePostsConfig({
      owners: ["700000000000000001"],
      posts: { approver_user_ids: ["700000000000000002", "700000000000000001"] },
    });
    expect(posts.approverUserIds).toEqual(["700000000000000002", "700000000000000001"]);
  });
});

describe("applyPresetEmbedDefaults", () => {
  const preset = { name: "M", color: 5, footer: "foot" };
  it("fills only missing color/footer", () => {
    expect(applyPresetEmbedDefaults({ title: "t" }, preset)).toEqual({
      title: "t",
      color: 5,
      footer: { text: "foot" },
    });
    expect(applyPresetEmbedDefaults({ color: 0, footer: { text: "mine" } }, preset)).toEqual({
      color: 0,
      footer: { text: "mine" },
    });
  });
});

describe("validatePostingKit", () => {
  function project(extra: Partial<ProjectConfig>): ProjectConfig {
    return { ...base, ...extra } as ProjectConfig;
  }

  it("is silent for a project that does not use the kit", () => {
    expect(validatePostingKit("p", project({}))).toEqual({ warnings: [], errors: [] });
  });

  it("errors on a preset default_channel that is not an alias", () => {
    const { errors } = validatePostingKit(
      "p",
      project({ personas: { m: { name: "Meelah", default_channel: "nope" } } }),
    );
    expect(errors.join("\n")).toMatch(/preset "m" default_channel "nope"/);
  });

  it("warns about a preset key send_as cannot accept", () => {
    const { warnings } = validatePostingKit(
      "p",
      project({ personas: { "discord-news": { name: "News" } } }),
    );
    expect(warnings.join("\n")).toMatch(/preset key "discord-news" fails persona-name rules/);
  });

  it("errors on duplicate preset names", () => {
    const { errors } = validatePostingKit(
      "p",
      project({ personas: { a: { name: "Meelah" }, b: { name: "meelah" } } }),
    );
    expect(errors.join("\n")).toMatch(/share the name/);
  });

  it("warns about a missing preview channel, no approvers, and auto announcements", () => {
    const { warnings } = validatePostingKit(
      "p",
      project({
        channels: { welcome: "500000000000000002" },
        posts: { auto_types: ["announcement", "server_status"] },
      }),
    );
    const text = warnings.join("\n");
    expect(text).toMatch(/preview channel "feed-preview"/);
    expect(text).toMatch(/no approvers/);
    expect(text).toMatch(/auto_types includes "announcement"/);
    expect(text).not.toMatch(/"server_status"/);
  });
});

describe("profileGateError", () => {
  const config = {
    global: {
      bots: {
        reader: { name: "Reader", token_env: "R", default_profile: "readonly" },
        writer: { name: "Writer", token_env: "W" },
      },
      projects: {
        p: {
          guild_id: "444444444444444444",
          bot: "writer",
          channels: {
            open: "500000000000000001",
            locked: { id: "500000000000000002", bot: "reader" },
          },
        },
        profiled: {
          guild_id: "444444444444444444",
          tool_profile: "messaging",
          profile_remove: ["send_post"],
          channels: { a: "500000000000000003" },
        },
      },
    },
  } as any;

  it("allows tools when no profile applies", () => {
    expect(profileGateError("preview_post", "p", "open", config)).toBeUndefined();
  });

  it("applies a channel override bot's default_profile", () => {
    expect(profileGateError("preview_post", "p", "locked", config)).toMatch(/"readonly" profile/);
    expect(profileGateError("list_posts", "p", "locked", config)).toBeUndefined();
  });

  it("applies the project tool_profile with removals", () => {
    expect(profileGateError("preview_post", "profiled", "a", config)).toBeUndefined();
    expect(profileGateError("send_post", "profiled", "a", config)).toMatch(/"messaging" profile/);
  });

  it("projectLevelOnly skips bot profiles but keeps the project tool_profile", () => {
    const readonlyProjectBot = {
      global: {
        bots: { reader: { name: "Reader", token_env: "R", default_profile: "readonly" } },
        projects: {
          q: {
            guild_id: "444444444444444444",
            bot: "reader",
            channels: { a: "500000000000000004" },
          },
        },
      },
    } as any;
    expect(profileGateError("preview_post", "q", undefined, readonlyProjectBot)).toMatch(
      /readonly/,
    );
    expect(
      profileGateError("preview_post", "q", undefined, readonlyProjectBot, {
        projectLevelOnly: true,
      }),
    ).toBeUndefined();
    expect(
      profileGateError("send_post", "profiled", undefined, config, { projectLevelOnly: true }),
    ).toMatch(/"messaging" profile/);
  });

  it("ignores unknown projects", () => {
    expect(profileGateError("send_post", "nope", undefined, config)).toBeUndefined();
  });
});
