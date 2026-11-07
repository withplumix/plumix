import { describe, expect, test } from "vitest";

import { Image } from "../../src/blocks/renderer/index.js";
import { fallback } from "../../src/route/render/template-builders.js";
import { defineTemplate } from "../../src/template.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

/**
 * The site's image delivery is the kit's fake, which hands a source back
 * unchanged; the widths it is asked for are covered by `image.test.tsx`.
 */
const imageDelivery = { kind: "images", url: (src: string) => src };

const site = await testSite({
  config: {
    imageDelivery,
    images: { remotePatterns: [{ hostname: "cdn.example.com" }] },
    theme: defineTheme({
      templates: [
        fallback(
          defineTemplate({
            render: () => (
              <main>
                <Image src="/a.jpg" alt="A" width={400} height={300} />
                <Image
                  src="https://cdn.example.com/ok.jpg"
                  alt="ok"
                  width={200}
                  height={200}
                />
                <Image
                  src="https://evil.com/no.jpg"
                  alt="no"
                  width={200}
                  height={200}
                />
                <Image
                  src="/hero.jpg"
                  alt="hero"
                  width={400}
                  height={300}
                  priority
                />
              </main>
            ),
          }),
        ),
      ],
    }),
  },
});

describe("an <Image> on a site with image delivery", () => {
  test("builds a responsive srcset from the configured imageDelivery", async () => {
    const page = await site.visit("/");

    page.assertSee(
      '<img src="/a.jpg" srcSet="/a.jpg 1x, /a.jpg 2x" width="400" height="300" alt="A" loading="lazy"',
    );
  });

  test("optimizes an allowlisted remote host", async () => {
    const page = await site.visit("/");

    page.assertSee(
      'srcSet="https://cdn.example.com/ok.jpg 1x, https://cdn.example.com/ok.jpg 2x"',
    );
  });

  test("passes a source on any other host through, with no srcset", async () => {
    const page = await site.visit("/");

    page.assertSee(
      '<img src="https://evil.com/no.jpg" width="200" height="200" alt="no" loading="lazy"',
    );
  });

  test("hoists one preload link into <head> for a priority image", async () => {
    const page = await site.visit("/");

    page.assertSeeInOrder([
      "<head>",
      '<link rel="preload" as="image" fetchPriority="high" imageSrcSet="/hero.jpg 1x, /hero.jpg 2x"/>',
      "</head>",
      'alt="hero" loading="eager"',
    ]);
  });

  test("preloads a priority image once", async () => {
    const page = await site.visit("/");

    expect(() =>
      page.assertSeeInOrder(['rel="preload"', 'rel="preload"']),
    ).toThrow();
  });
});
