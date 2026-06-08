import { describe, expect, test } from "vitest";

import { resolveEmbed } from "./resolve.js";

describe("resolveEmbed", () => {
  test("maps a YouTube watch URL to a nocookie embed", () => {
    const r = resolveEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(r?.provider).toBe("youtube");
    expect(r?.src).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
    expect(r?.sandboxed).toBe(false);
  });

  test("maps youtu.be short links and /shorts/ paths", () => {
    expect(resolveEmbed("https://youtu.be/dQw4w9WgXcQ")?.src).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ",
    );
    expect(
      resolveEmbed("https://www.youtube.com/shorts/dQw4w9WgXcQ")?.src,
    ).toBe("https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ");
  });

  test("maps a Vimeo URL to the player embed", () => {
    const r = resolveEmbed("https://vimeo.com/123456789");
    expect(r?.provider).toBe("vimeo");
    expect(r?.src).toBe("https://player.vimeo.com/video/123456789");
    expect(r?.sandboxed).toBe(false);
  });

  test("video providers carry a 16/9 aspect and allow fullscreen", () => {
    const yt = resolveEmbed("https://youtu.be/dQw4w9WgXcQ");
    expect(yt?.aspect).toBe("16 / 9");
    expect(yt?.allowFullscreen).toBe(true);
    expect(yt?.height).toBeUndefined();
  });

  test("maps a Loom share URL to the embed path", () => {
    const r = resolveEmbed("https://www.loom.com/share/abc123");
    expect(r?.provider).toBe("loom");
    expect(r?.src).toBe("https://www.loom.com/embed/abc123");
  });

  test("maps Spotify entities to fixed-height embeds", () => {
    const r = resolveEmbed("https://open.spotify.com/track/abc123");
    expect(r?.provider).toBe("spotify");
    expect(r?.src).toBe("https://open.spotify.com/embed/track/abc123");
    expect(r?.height).toBe(352);
    expect(r?.aspect).toBeUndefined();
  });

  test("maps a CodePen pen to its embed path", () => {
    const r = resolveEmbed("https://codepen.io/team/pen/xyz789");
    expect(r?.provider).toBe("codepen");
    expect(r?.src).toBe("https://codepen.io/team/embed/xyz789");
    expect(r?.height).toBe(400);
  });

  test("falls back to a sandboxed generic iframe for non-safelist https URLs", () => {
    const r = resolveEmbed("https://example.com/widget");
    expect(r?.provider).toBe("generic");
    expect(r?.src).toBe("https://example.com/widget");
    expect(r?.sandboxed).toBe(true);
  });

  test("rejects crafted provider paths instead of emitting a malformed src", () => {
    // A non-11-char / path-bearing YouTube id falls through to the
    // sandboxed generic path rather than producing a broken embed src.
    const traversal = resolveEmbed(
      "https://www.youtube.com/watch?v=../../@evil.com/x",
    );
    expect(traversal?.provider).toBe("generic");
    expect(traversal?.sandboxed).toBe(true);
    // A Spotify id with a disallowed character is rejected too.
    expect(
      resolveEmbed("https://open.spotify.com/track/has.dot")?.provider,
    ).toBe("generic");
  });

  test("rejects non-http(s) and unparseable URLs", () => {
    expect(resolveEmbed("javascript:alert(1)")).toBeNull();
    expect(resolveEmbed("data:text/html,<script>x</script>")).toBeNull();
    expect(resolveEmbed("ftp://example.com/file")).toBeNull();
    expect(resolveEmbed("not a url")).toBeNull();
    expect(resolveEmbed("")).toBeNull();
  });
});
