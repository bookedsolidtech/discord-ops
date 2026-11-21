import { describe, it, expect, vi, afterEach } from "vitest";
import { fetchYoutubeVideoInfo } from "../../src/posts/youtube.js";

function respond(status: number, body = "") {
  return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status }));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fetchYoutubeVideoInfo", () => {
  it("queries the fixed oEmbed endpoint and maps the fields", async () => {
    const spy = respond(
      200,
      JSON.stringify({
        title: "Our new base",
        thumbnail_url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
        author_name: "Strawn Games",
        author_url: "https://www.youtube.com/@strawngames",
        html: "<iframe>",
      }),
    );
    const info = await fetchYoutubeVideoInfo("dQw4w9WgXcQ");
    expect(info).toEqual({
      title: "Our new base",
      image: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg",
      author_name: "Strawn Games",
      author_url: "https://www.youtube.com/@strawngames",
    });
    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe(
      "https://www.youtube.com/oembed?format=json&url=https%3A%2F%2Fwww.youtube.com%2Fwatch%3Fv%3DdQw4w9WgXcQ",
    );
    expect((init as RequestInit).redirect).toBe("manual");
  });

  it.each([
    [401, /private/],
    [403, /private/],
    [404, /does not exist/],
    [302, /HTTP 302/],
    [500, /HTTP 500/],
  ])("maps HTTP %i to an error", async (status, message) => {
    respond(status);
    expect((await fetchYoutubeVideoInfo("dQw4w9WgXcQ")).error).toMatch(message);
  });

  it("reports network failures and unreadable bodies as errors", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("ENOTFOUND"));
    expect((await fetchYoutubeVideoInfo("dQw4w9WgXcQ")).error).toMatch(/could not reach/);
    vi.restoreAllMocks();
    respond(200, "<html>");
    expect((await fetchYoutubeVideoInfo("dQw4w9WgXcQ")).error).toMatch(/unreadable/);
  });

  it("never fetches for a malformed id", async () => {
    const spy = vi.spyOn(globalThis, "fetch");
    expect((await fetchYoutubeVideoInfo("../../evil")).error).toMatch(/invalid/);
    expect(spy).not.toHaveBeenCalled();
  });
});
