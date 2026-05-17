import { mockRegistry, renderBlock } from "plumix/blocks/test";
import { describe, expect, test } from "vitest";

import { audioBlock } from "./audio/index.js";
import { videoBlock } from "./video/index.js";

describe("media/video", () => {
  test("renders <video> with src + controls", async () => {
    const registry = await mockRegistry({ core: [videoBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/video",
            attrs: { src: "/clip.mp4" },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('data-plumix-block="media/video"');
    expect(html).toContain('src="/clip.mp4"');
    expect(html).toContain("controls");
  });

  test("autoplay + loop + muted + poster attributes round-trip", async () => {
    const registry = await mockRegistry({ core: [videoBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/video",
            attrs: {
              src: "/clip.mp4",
              poster: "/cover.jpg",
              autoplay: true,
              loop: true,
              muted: true,
            },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('poster="/cover.jpg"');
    // React's SSR preserves camelCase here even though the browser
    // normalises the attributes to lowercase at the DOM level. We
    // check the HTML stream — they round-trip to the real <video>
    // attributes on the client side.
    expect(html).toContain("autoPlay");
    expect(html).toContain("loop");
    expect(html).toContain("muted");
  });
});

describe("media/audio", () => {
  test("renders <audio> with src + controls", async () => {
    const registry = await mockRegistry({ core: [audioBlock] });
    const html = renderBlock({
      registry,
      content: {
        type: "doc",
        content: [
          {
            type: "media/audio",
            attrs: { src: "/song.mp3" },
            content: [],
          },
        ],
      },
    });
    expect(html).toContain('data-plumix-block="media/audio"');
    expect(html).toContain('src="/song.mp3"');
    expect(html).toContain("controls");
  });
});
