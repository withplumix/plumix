import { describe, expect, test } from "vitest";

import { renderBlockSpecToHtml, renderBlockTreeToHtml } from "../test/index.js";
import { videoBlock } from "./index.js";

describe("core/video", () => {
  test("renders <video> with src + poster + controls by default", () => {
    const html = renderBlockSpecToHtml(videoBlock, {
      src: "/_plumix/media/x/clip.mp4",
      poster: "/_plumix/media/x/poster.jpg",
    });
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

  test("omits src entirely when empty (no broken <video src='' >)", () => {
    const html = renderBlockSpecToHtml(videoBlock, { src: "" });
    expect(html).toContain("<video");
    expect(html).not.toContain("src=");
  });

  test("has no Media id input and seeds a responsive default width", () => {
    const names = videoBlock.inputs?.map((i) => i.name) ?? [];
    expect(names).not.toContain("mediaId");
    expect(videoBlock.defaultStyles?.large?.width).toContain(
      "--plumix-video-width",
    );
  });

  test("seeded default styles emit sizing CSS onto the <video>", () => {
    const html = renderBlockTreeToHtml(
      [videoBlock],
      [
        {
          id: "v1",
          name: "core/video",
          attrs: { src: "/x.mp4" },
          style: videoBlock.defaultStyles,
        },
      ],
    );
    // selfSeam: the scoped class lands on the <video>, and the box sizing rides
    // as var(--plumix-video-*) a theme can override.
    expect(html).toContain('<video class="plumix-block-v1"');
    expect(html).toContain("--plumix-video-aspect");
  });
});
