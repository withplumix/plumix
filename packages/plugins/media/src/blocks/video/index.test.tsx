import { renderBlockSpecToHtml } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { videoBlock } from "./index.js";

describe("media/video v2", () => {
  test("renders <video> with src + poster + controls by default", () => {
    const html = renderBlockSpecToHtml(videoBlock, {
      src: "/_plumix/media/x/clip.mp4",
      poster: "/_plumix/media/x/poster.jpg",
    });
    expect(html).toContain('data-plumix-block="media/video"');
    expect(html).toContain('src="/_plumix/media/x/clip.mp4"');
    expect(html).toContain('poster="/_plumix/media/x/poster.jpg"');
    expect(html).toContain("controls=");
  });

  test("playsinline default is true and respected by the render", () => {
    const html = renderBlockSpecToHtml(videoBlock, { src: "/x.mp4" });
    expect(html).toMatch(/playsinline/i);
  });

  test("muted + loop + autoplay map to native attrs", () => {
    const html = renderBlockSpecToHtml(videoBlock, {
      src: "/x.mp4",
      muted: true,
      loop: true,
      autoplay: true,
    });
    expect(html).toMatch(/muted/i);
    expect(html).toMatch(/loop/i);
    expect(html).toMatch(/autoplay/i);
  });
});
