import { describe, it, expect } from "vitest";
import {
  STATUS_COLORS,
  isCountingCubes,
  isUnavailableTitle,
  payloadSha256,
  renderPost,
  type PresetRef,
} from "../../src/posts/render.js";
import { PostValidationError, parsePost, youtubeVideoId } from "../../src/posts/schema.js";

const meelah: PresetRef = {
  key: "meelah",
  preset: { name: "Meelah", color: 0xff66cc, footer: "Meelah Says" },
};
const cubes: PresetRef = { key: "counting-cubes", preset: { name: "Counting Cubes Sheep" } };
const VIDEO = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";
const og = {
  title: "Building a castle!",
  description: "We build a big castle.",
  image: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hq.jpg",
};

function expectRefusal(fn: () => unknown, match: RegExp) {
  expect(fn).toThrow(PostValidationError);
  expect(fn).toThrow(match);
}

describe("renderPost — welcome / rules", () => {
  it("renders title, body, and sections as fields with preset color/footer", () => {
    const out = renderPost(
      {
        type: "welcome",
        persona: "meelah",
        title: "Welcome!",
        body: "Hi friends",
        sections: [{ name: "Be kind", value: "Always" }],
        pin: true,
      },
      meelah,
    );
    expect(out.content).toBeUndefined();
    expect(out.embeds).toEqual([
      {
        title: "Welcome!",
        description: "Hi friends",
        fields: [{ name: "Be kind", value: "Always" }],
        color: 0xff66cc,
        footer: { text: "Meelah Says" },
      },
    ]);
  });

  it("uses the type default color when no preset color", () => {
    const out = renderPost({ type: "rules", persona: "x", title: "Rules", body: "1. Be nice" });
    expect(out.embeds[0]!.color).toBe(0x5865f2);
    expect(out.embeds[0]!.footer).toBeUndefined();
    expect(out.embeds[0]!.fields).toBeUndefined();
  });

  it("rejects more than 25 sections", () => {
    const sections = Array.from({ length: 26 }, (_, i) => ({ name: `s${i}`, value: "v" }));
    expectRefusal(
      () => renderPost({ type: "rules", persona: "x", title: "R", body: "b", sections }),
      /sections/,
    );
  });

  it("rejects a body over 4096 characters", () => {
    expectRefusal(
      () => renderPost({ type: "welcome", persona: "x", title: "W", body: "a".repeat(4097) }),
      /body/,
    );
  });
});

describe("renderPost — announcement", () => {
  it("renders link and image", () => {
    const out = renderPost({
      type: "announcement",
      persona: "x",
      title: "Big news",
      body: "New biome!",
      image_url: "https://cdn.example.com/a.png",
      link_url: "https://example.com/news",
    });
    expect(out.embeds[0]).toMatchObject({
      title: "Big news",
      description: "New biome!",
      url: "https://example.com/news",
      image: { url: "https://cdn.example.com/a.png" },
      color: 0xfee75c,
    });
  });

  it.each([
    ["http://example.com/a.png", "plain http"],
    ["https://127.0.0.1/a.png", "loopback"],
    ["https://169.254.169.254/latest", "link-local metadata"],
    ["https://10.0.0.5/a.png", "private"],
    ["https://localhost/a.png", "localhost"],
    ["javascript:alert(1)", "non-http"],
  ])("refuses image_url %s (%s)", (url) => {
    expectRefusal(
      () =>
        renderPost({ type: "announcement", persona: "x", title: "t", body: "b", image_url: url }),
      /image_url/,
    );
  });
});

describe("renderPost — video_upload", () => {
  const post = { type: "video_upload", persona: "strawn", url: VIDEO, note: "New video!" };

  it("renders the OG title/description/image with the canonical watch URL", () => {
    const out = renderPost(
      { ...post, url: "https://youtu.be/dQw4w9WgXcQ?si=tracking" },
      undefined,
      { og },
    );
    expect(out.content).toBe("New video!");
    expect(out.embeds[0]).toEqual({
      title: "Building a castle!",
      url: VIDEO,
      description: "We build a big castle.",
      image: { url: og.image },
      color: 0xff0000,
    });
  });

  it("decodes HTML entities in OG text", () => {
    const out = renderPost(post, undefined, {
      og: { title: "Tom &amp; Jerry&#39;s &quot;base&quot;" },
    });
    expect(out.embeds[0]!.title).toBe(`Tom & Jerry's "base"`);
  });

  it("drops a non-public OG image instead of embedding it", () => {
    const out = renderPost(post, undefined, {
      og: { title: "ok", image: "http://10.0.0.1/x.png" },
    });
    expect(out.embeds[0]!.image).toBeUndefined();
  });

  it("refuses without OG data", () => {
    expectRefusal(() => renderPost(post), /metadata/);
  });

  it.each([
    "",
    "   ",
    "YouTube",
    "- YouTube",
    "Video unavailable",
    "Private video",
    "Deleted video",
  ])("refuses an unavailable-looking OG title %j", (title) => {
    expectRefusal(() => renderPost(post, undefined, { og: { title } }), /looks unavailable/);
  });

  it("refuses a missing title", () => {
    expectRefusal(() => renderPost(post, undefined, { og: {} }), /title missing/);
  });

  it("refuses when the lookup reported an error, even with a title", () => {
    expectRefusal(
      () =>
        renderPost(post, undefined, {
          og: { title: "x", error: "YouTube reports the video does not exist" },
        }),
      /does not exist/,
    );
  });

  it.each([
    "https://www.youtube.com/playlist?list=PL123",
    "https://www.youtube.com/@strawn",
    "http://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://evil.example.com/watch?v=dQw4w9WgXcQ",
    "https://www.youtube.com/watch?v=short",
  ])("refuses non-video URL %s", (url) => {
    expectRefusal(() => renderPost({ ...post, url }, undefined, { og }), /YouTube video URL/);
  });

  describe("Counting Cubes", () => {
    it("requires confirm_public when series is counting-cubes", () => {
      expectRefusal(
        () => renderPost({ ...post, series: "Counting Cubes" }, undefined, { og }),
        /confirm_public: true/,
      );
    });

    it("requires confirm_public when the preset key is counting-cubes", () => {
      expectRefusal(
        () => renderPost({ ...post, persona: "counting-cubes" }, cubes, { og }),
        /cannot detect unlisted/,
      );
    });

    it("requires confirm_public when the preset name says Counting Cubes", () => {
      const sheep: PresetRef = { key: "sheep", preset: { name: "Counting Cubes" } };
      expectRefusal(
        () => renderPost({ ...post, persona: "sheep" }, sheep, { og }),
        /confirm_public/,
      );
    });

    it("refuses confirm_public: false", () => {
      expectRefusal(
        () =>
          renderPost({ ...post, series: "counting-cubes", confirm_public: false }, undefined, {
            og,
          }),
        /confirm_public/,
      );
    });

    it("renders with confirm_public: true", () => {
      const out = renderPost({ ...post, persona: "counting-cubes", confirm_public: true }, cubes, {
        og,
      });
      expect(out.embeds[0]!.title).toBe("Building a castle!");
    });

    it("does not gate other series", () => {
      expect(() =>
        renderPost({ ...post, series: "smp-season-1" }, undefined, { og }),
      ).not.toThrow();
    });
  });
});

describe("renderPost — server_status", () => {
  it.each([
    ["up", STATUS_COLORS.up, /online/],
    ["down", STATUS_COLORS.down, /offline/],
    ["maintenance", STATUS_COLORS.maintenance, /maintenance/],
  ] as const)("state %s gets its color and title", (state, color, title) => {
    const out = renderPost({ type: "server_status", persona: "x", state }, meelah);
    expect(out.embeds[0]!.color).toBe(color); // state color beats preset color
    expect(out.embeds[0]!.title).toMatch(title);
    expect(out.embeds[0]!.footer).toEqual({ text: "Meelah Says" });
  });

  it("renders address, version, players, and note", () => {
    const out = renderPost({
      type: "server_status",
      persona: "x",
      state: "up",
      address: "play.example.com",
      version: "1.21.4",
      players: 0,
      note: "Come play!",
    });
    expect(out.embeds[0]!.description).toBe("Come play!");
    expect(out.embeds[0]!.fields).toEqual([
      { name: "Address", value: "play.example.com", inline: true },
      { name: "Version", value: "1.21.4", inline: true },
      { name: "Players", value: "0", inline: true },
    ]);
  });

  it("rejects an unknown state", () => {
    expectRefusal(
      () => renderPost({ type: "server_status", persona: "x", state: "sideways" }),
      /state/,
    );
  });
});

describe("renderPost — event", () => {
  const base = {
    type: "event",
    persona: "x",
    title: "Build contest",
    description: "Build a house",
    starts_at: "2026-12-05T19:00:00-05:00",
  };
  const start = Date.parse("2026-12-05T19:00:00-05:00") / 1000;

  it("renders Discord timestamps for start and end", () => {
    const out = renderPost({
      ...base,
      ends_at: "2026-12-05T21:00:00-05:00",
      location: "Spawn",
      image_url: "https://cdn.example.com/e.png",
    });
    expect(out.embeds[0]!.fields).toEqual([
      { name: "Starts", value: `<t:${start}:F> (<t:${start}:R>)` },
      { name: "Ends", value: `<t:${start + 7200}:F>` },
      { name: "Where", value: "Spawn" },
    ]);
    expect(out.embeds[0]!.image).toEqual({ url: "https://cdn.example.com/e.png" });
  });

  it.each(["next friday", "2026-12-05", "2026-12-05T19:00:00"])(
    "rejects starts_at %j",
    (starts_at) => {
      expectRefusal(() => renderPost({ ...base, starts_at }), /starts_at/);
    },
  );

  it("rejects ends_at before starts_at", () => {
    expectRefusal(() => renderPost({ ...base, ends_at: "2026-12-05T18:00:00-05:00" }), /ends_at/);
  });
});

describe("renderPost — build_spotlight", () => {
  it("renders builder field and required image", () => {
    const out = renderPost({
      type: "build_spotlight",
      persona: "x",
      title: "Sky castle",
      builder: "Sprout",
      image_url: "https://cdn.example.com/b.png",
    });
    expect(out.embeds[0]).toMatchObject({
      title: "Sky castle",
      fields: [{ name: "Builder", value: "Sprout", inline: true }],
      image: { url: "https://cdn.example.com/b.png" },
    });
  });

  it("requires image_url", () => {
    expectRefusal(
      () => renderPost({ type: "build_spotlight", persona: "x", title: "t", builder: "b" }),
      /image_url/,
    );
  });
});

describe("renderPost — character_line", () => {
  it("posts the line as content with no embed", () => {
    const out = renderPost({ type: "character_line", persona: "x", line: "Rawr!" }, meelah);
    expect(out).toEqual({ content: "Rawr!", embeds: [] });
  });

  it("adds an image embed with preset defaults", () => {
    const out = renderPost(
      {
        type: "character_line",
        persona: "x",
        line: "Look!",
        image_url: "https://cdn.example.com/c.png",
      },
      meelah,
    );
    expect(out.embeds).toEqual([
      {
        image: { url: "https://cdn.example.com/c.png" },
        color: 0xff66cc,
        footer: { text: "Meelah Says" },
      },
    ]);
  });

  it("caps the line at Discord's 2000 characters", () => {
    expect(() =>
      renderPost({ type: "character_line", persona: "x", line: "a".repeat(2000) }),
    ).not.toThrow();
    expectRefusal(
      () => renderPost({ type: "character_line", persona: "x", line: "a".repeat(2001) }),
      /line/,
    );
  });
});

describe("renderPost — general validation", () => {
  it("rejects an unknown type", () => {
    expectRefusal(() => renderPost({ type: "meme", persona: "x" }), /Invalid post/);
  });

  it("rejects a missing persona", () => {
    expectRefusal(() => renderPost({ type: "character_line", line: "hi" }), /persona/);
  });

  it("enforces Discord's 6000-character embed total", () => {
    const sections = Array.from({ length: 5 }, (_, i) => ({
      name: `s${i}`,
      value: "v".repeat(1000),
    }));
    expectRefusal(
      () =>
        renderPost({ type: "rules", persona: "x", title: "R", body: "b".repeat(2000), sections }),
      /6000/,
    );
  });

  it("is deterministic", () => {
    const post = {
      type: "event",
      persona: "x",
      title: "t",
      description: "d",
      starts_at: "2026-12-05T19:00:00Z",
    };
    expect(renderPost(post, meelah)).toEqual(renderPost(post, meelah));
  });
});

describe("helpers", () => {
  it("youtubeVideoId accepts watch, shorts, live, youtu.be", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://m.youtube.com/live/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ");
    expect(youtubeVideoId("https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ")).toBeUndefined();
  });

  it("isUnavailableTitle", () => {
    expect(isUnavailableTitle(undefined)).toBe(true);
    expect(isUnavailableTitle("My great video")).toBe(false);
  });

  it.each(["Private Video Reveal!", "This video is available now!", "My YouTube setup"])(
    "isUnavailableTitle does not flag a real title %j",
    (title) => {
      expect(isUnavailableTitle(title)).toBe(false);
    },
  );

  it.each(["Counting_Cubes", "CountingCubes", "counting cubes!"])(
    "isCountingCubes matches persona %j",
    (persona) => {
      const post = parsePost({ type: "character_line", persona, line: "baa" });
      expect(isCountingCubes(post)).toBe(true);
    },
  );

  it.each(["Counting Cubes S2", "countingcubes"])("isCountingCubes matches series %j", (series) => {
    const post = parsePost({
      type: "video_upload",
      persona: "strawn",
      url: "https://youtu.be/dQw4w9WgXcQ",
      series,
    });
    expect(isCountingCubes(post)).toBe(true);
  });

  it("isCountingCubes matches the uploading channel", () => {
    const post = parsePost({
      type: "video_upload",
      persona: "strawn",
      url: "https://youtu.be/dQw4w9WgXcQ",
    });
    expect(
      isCountingCubes(post, undefined, { author_url: "https://www.youtube.com/@CountingCubes" }),
    ).toBe(true);
    expect(isCountingCubes(post, undefined, { author_name: "Strawn Games" })).toBe(false);
  });

  it("a Counting Cubes uploader requires confirm_public", () => {
    const post = { type: "video_upload", persona: "strawn", url: "https://youtu.be/dQw4w9WgXcQ" };
    expectRefusal(
      () => renderPost(post, undefined, { og: { title: "Count!", author_name: "Counting Cubes" } }),
      /confirm_public/,
    );
  });

  it("payloadSha256 ignores key order and undefined values", () => {
    expect(payloadSha256({ a: 1, b: { c: 2, d: undefined } })).toBe(
      payloadSha256({ b: { c: 2 }, a: 1 }),
    );
    expect(payloadSha256({ a: 1 })).not.toBe(payloadSha256({ a: 2 }));
  });
});

describe("renderPost — schedule_update", () => {
  const base = {
    type: "schedule_update",
    persona: "x",
    title: "Build night",
    change: "Now at 7pm",
  };

  it("renders a compact amber embed that beats the preset color", () => {
    const out = renderPost(
      {
        ...base,
        starts_at: "2026-12-05T19:00:00-05:00",
        ends_at: "2026-12-05T21:00:00-05:00",
        note: "Bring snacks",
      },
      meelah,
    );
    const start = Date.parse("2026-12-05T19:00:00-05:00") / 1000;
    expect(out.embeds[0]).toMatchObject({
      title: "\u{1F552} Build night",
      description: "Now at 7pm\n\nBring snacks",
      color: 0xfaa61a,
      footer: { text: "Meelah Says" },
      fields: [
        { name: "When", value: `<t:${start}:F> (<t:${start}:R>)`, inline: true },
        { name: "Until", value: `<t:${start + 7200}:t>`, inline: true },
      ],
    });
  });

  it("turns red with a cancelled title", () => {
    const out = renderPost({ ...base, cancelled: true });
    expect(out.embeds[0]).toMatchObject({ title: "❌ Cancelled: Build night", color: 0xed4245 });
    expect(out.embeds[0]!.fields).toBeUndefined();
  });

  it("keeps a maximum-length title within Discord's 256 characters after the prefix", () => {
    for (const cancelled of [false, true]) {
      const out = renderPost({ ...base, title: "t".repeat(256), cancelled });
      expect(out.embeds[0]!.title!.length).toBeLessThanOrEqual(256);
    }
  });

  it("rejects a change over 1000 characters and ends_at before starts_at", () => {
    expectRefusal(() => renderPost({ ...base, change: "a".repeat(1001) }), /change/);
    expectRefusal(
      () =>
        renderPost({
          ...base,
          starts_at: "2026-12-05T19:00:00Z",
          ends_at: "2026-12-05T18:00:00Z",
        }),
      /ends_at/,
    );
  });
});

describe("renderPost — custom", () => {
  it("passes content and embeds through, filling preset color/footer only where missing", () => {
    const out = renderPost(
      {
        type: "custom",
        persona: "x",
        content: "Hi",
        embeds: [
          { title: "A", color: 1 },
          { title: "B", footer: { text: "own" } },
        ],
      },
      meelah,
    );
    expect(out).toEqual({
      content: "Hi",
      embeds: [
        { title: "A", color: 1, footer: { text: "Meelah Says" } },
        { title: "B", footer: { text: "own" }, color: 0xff66cc },
      ],
    });
  });

  it("allows content only, or embeds only", () => {
    expect(renderPost({ type: "custom", persona: "x", content: "Hi" })).toEqual({
      content: "Hi",
      embeds: [],
    });
    expect(
      renderPost({ type: "custom", persona: "x", embeds: [{ title: "A" }] }).content,
    ).toBeUndefined();
  });

  it("refuses an empty custom post and more than 10 embeds", () => {
    expectRefusal(
      () => renderPost({ type: "custom", persona: "x", content: "  " }),
      /needs content/,
    );
    const embeds = Array.from({ length: 11 }, () => ({ title: "t" }));
    expectRefusal(() => renderPost({ type: "custom", persona: "x", embeds }), /embeds/);
  });

  it.each([
    { thumbnail: { url: "https://192.168.1.1/t.png" } },
    { author: { name: "a", url: "http://example.com" } },
  ])("refuses a non-public-https embed URL %j", (embed) => {
    expectRefusal(
      () => renderPost({ type: "custom", persona: "x", embeds: [embed] }),
      /public https/,
    );
  });
});

describe("renderPost — forum_post", () => {
  it("renders the starter message and the thread name/tags", () => {
    const out = renderPost({
      type: "forum_post",
      persona: "x",
      title: "Castles",
      content: "Show us",
      tags: ["Castle"],
      embeds: [{ title: "Rules" }],
    });
    expect(out).toEqual({
      content: "Show us",
      embeds: [{ title: "Rules" }],
      thread: { name: "Castles", tags: ["Castle"] },
    });
  });

  it("rejects a title over 100 characters and missing content", () => {
    expectRefusal(
      () => renderPost({ type: "forum_post", persona: "x", title: "a".repeat(101), content: "c" }),
      /title/,
    );
    expectRefusal(() => renderPost({ type: "forum_post", persona: "x", title: "t" }), /content/);
  });
});

describe("renderPost — pin and channel_id on every type", () => {
  it("accepts pin and channel_id on any post type", () => {
    expect(() =>
      renderPost({
        type: "server_status",
        persona: "x",
        state: "up",
        pin: true,
        channel_id: "500000000000000001",
      }),
    ).not.toThrow();
    expectRefusal(
      () => renderPost({ type: "server_status", persona: "x", state: "up", channel_id: "abc" }),
      /channel_id/,
    );
  });
});
