import { expect, test } from "vitest";

import { Image } from "@plumix/blocks/renderer";

import type { ImageDelivery } from "../runtime/slots.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";

const imageDelivery: ImageDelivery = {
  kind: "stub",
  url: (src, opts) =>
    opts?.width === undefined ? src : `${src}?w=${opts.width}`,
};

const imageTheme = defineTheme({
  templates: {
    index: defineTemplate({
      render: () => (
        <main>
          <Image src="/a.jpg" alt="A" width={400} height={300} />
        </main>
      ),
    }),
  },
});

test("<Image> builds a responsive srcset from the configured imageDelivery", async () => {
  const h = await createDispatcherHarness({ theme: imageTheme, imageDelivery });
  const response = await h.dispatch(new Request("https://cms.example/"));
  const body = await response.text();

  expect(body).toContain('src="/a.jpg?w=400"');
  expect(body).toContain('srcSet="/a.jpg?w=400 1x, /a.jpg?w=800 2x"');
  expect(body).toContain('loading="lazy"');
});

const remoteTheme = defineTheme({
  templates: {
    index: defineTemplate({
      render: () => (
        <main>
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
        </main>
      ),
    }),
  },
});

test("<Image> optimizes allowlisted remote hosts and passes through the rest", async () => {
  const h = await createDispatcherHarness({
    theme: remoteTheme,
    imageDelivery,
    images: { remotePatterns: [{ hostname: "cdn.example.com" }] },
  });
  const body = await (
    await h.dispatch(new Request("https://cms.example/"))
  ).text();

  // allowlisted → optimized srcset
  expect(body).toContain("https://cdn.example.com/ok.jpg?w=200");
  // unauthorized → raw passthrough, no optimization query
  expect(body).toContain('src="https://evil.com/no.jpg"');
  expect(body).not.toContain("evil.com/no.jpg?w=");
});
