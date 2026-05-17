import { mockRegistry, renderBlock } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { embedBlock } from "./index.js";
import { resolveOEmbed } from "./safelist.js";

describe("resolveOEmbed", () => {
  test.each([
    [
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      "youtube",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ],
    [
      "https://youtu.be/dQw4w9WgXcQ",
      "youtube",
      "https://www.youtube.com/embed/dQw4w9WgXcQ",
    ],
    [
      "https://vimeo.com/76979871",
      "vimeo",
      "https://player.vimeo.com/video/76979871",
    ],
    [
      "https://open.spotify.com/track/3n3Ppam7vgaVa1iaRUc9Lp",
      "spotify",
      "https://open.spotify.com/embed/track/3n3Ppam7vgaVa1iaRUc9Lp",
    ],
    [
      "https://codepen.io/withplumix/pen/abc123",
      "codepen",
      "https://codepen.io/withplumix/embed/abc123",
    ],
    [
      "https://www.loom.com/share/abc123def",
      "loom",
      "https://www.loom.com/embed/abc123def",
    ],
  ])("recognises canonical share URL %s", (input, provider, embedUrl) => {
    const result = resolveOEmbed(input);
    expect(result?.provider).toBe(provider);
    expect(result?.embedUrl).toBe(embedUrl);
    // Every provider declares an `allow` (possibly empty for the
    // ones that need zero Permissions-Policy features).
    expect(typeof result?.allow).toBe("string");
  });

  test("rejects path-traversal in YouTube `v=` (id pattern blocks `../`)", () => {
    expect(
      resolveOEmbed("https://www.youtube.com/watch?v=../evil"),
    ).toBeUndefined();
  });

  test("rejects path-traversal in Spotify/CodePen/Loom ids", () => {
    expect(
      resolveOEmbed("https://open.spotify.com/track/../bad"),
    ).toBeUndefined();
    expect(
      resolveOEmbed("https://codepen.io/withplumix/pen/../escape"),
    ).toBeUndefined();
    expect(
      resolveOEmbed("https://www.loom.com/share/../escape"),
    ).toBeUndefined();
  });

  test("returns undefined for an unrecognised host", () => {
    expect(resolveOEmbed("https://example.com/video")).toBeUndefined();
  });

  test("rejects host look-alikes that prefix a safelist host", () => {
    // CodeQL flagged this — `hostname.includes("player.vimeo.com")`
    // would match `player.vimeo.com.evil.example`. The lookup uses
    // exact hostname matching against the provider's `hosts` array,
    // so the look-alike doesn't resolve to a safelist provider.
    expect(
      resolveOEmbed("https://player.vimeo.com.evil.example/76979871"),
    ).toBeUndefined();
    expect(
      resolveOEmbed("https://youtu.be.evil.example/dQw4w9WgXcQ"),
    ).toBeUndefined();
  });

  test("rejects non-http(s) protocols", () => {
    expect(resolveOEmbed("javascript:alert(1)")).toBeUndefined();
    expect(resolveOEmbed("file:///etc/passwd")).toBeUndefined();
  });

  test("returns undefined for a YouTube channel page (not embeddable)", () => {
    expect(resolveOEmbed("https://www.youtube.com/@plumix")).toBeUndefined();
  });
});

describe("media/embed Component", () => {
  test("renders a safelist iframe with the provider-specific embed URL and minimal allow directive", async () => {
    const registry = await mockRegistry({ core: [embedBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/embed",
            attrs: { url: "https://youtu.be/dQw4w9WgXcQ" },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('data-provider="youtube"');
    expect(html).toContain('src="https://www.youtube.com/embed/dQw4w9WgXcQ"');
    // YouTube allow set is minimal — no `clipboard-write`, `web-share`, etc.
    expect(html).toContain(
      'allow="autoplay; encrypted-media; picture-in-picture; fullscreen"',
    );
    // Safelist providers run without a sandbox (`null` origin would
    // break the embed JS); the trust comes from the hostname allowlist.
    expect(html).not.toContain("sandbox");
  });

  test("non-safelist URLs render through a sandboxed iframe WITHOUT allow-same-origin", async () => {
    // `allow-scripts` + `allow-same-origin` is the spec-documented
    // escape-the-sandbox combo for same-origin embeds. The generic
    // fallback must omit `allow-same-origin` so unknown hosts stay
    // in the `null` origin even if same-origin with the host site.
    const registry = await mockRegistry({ core: [embedBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/embed",
            attrs: { url: "https://example.com/widget" },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('data-provider="generic"');
    expect(html).toContain('src="https://example.com/widget"');
    expect(html).toContain('sandbox="allow-scripts allow-presentation"');
    expect(html).not.toContain("allow-same-origin");
  });

  test("renders no iframe when url attr is empty", async () => {
    // The walker wraps client-bearing blocks in a data-plumix-island
    // placeholder; that wrapper survives but its inner content is null
    // — the public site sees an empty island that the bootstrap can
    // populate when the editor later sets a url.
    const registry = await mockRegistry({ core: [embedBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [{ type: "media/embed", attrs: { url: "" }, content: [] }],
      },
    });
    expect(html).not.toContain("<iframe");
  });

  test("declares a client island for lazy loading", () => {
    expect(embedBlock.client?.src).toBe(
      "/_plumix/admin/assets/media-embed.client.js",
    );
  });
});
