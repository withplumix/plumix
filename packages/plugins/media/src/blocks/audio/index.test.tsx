import { renderBlockSpecToHtml } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { audioBlockV2 } from "./v2.js";

describe("media/audio v2", () => {
  test("renders <audio> with src + controls by default", () => {
    const html = renderBlockSpecToHtml(audioBlockV2, {
      src: "/_plumix/media/x/track.mp3",
    });
    expect(html).toContain('data-plumix-block="media/audio"');
    expect(html).toContain('src="/_plumix/media/x/track.mp3"');
    expect(html).toContain("controls=");
  });

  test("autoplay + loop attrs map to native attributes", () => {
    const html = renderBlockSpecToHtml(audioBlockV2, {
      src: "/x.mp3",
      autoplay: true,
      loop: true,
    });
    expect(html).toMatch(/autoplay/i);
    expect(html).toMatch(/loop/i);
  });
});
