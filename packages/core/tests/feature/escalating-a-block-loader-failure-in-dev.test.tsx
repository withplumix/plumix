import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { defineBlock } from "../../src/blocks/index.js";
import { BlockRenderer } from "../../src/blocks/renderer/index.js";
import { getContext } from "../../src/context/stores.js";
import { block } from "../../src/events-and-filters/block-render.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

const blogPlugin = definePlugin("blog", {
  setup: (ctx) => {
    ctx.registerEntryType("post", {
      label: "Posts",
      isPublic: true,
      hasArchive: true,
    });
  },
});

const throwingLoaderPlugin = definePlugin("acme-throwing-loader", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "acme/throwing-loader",
        view: () =>
          Promise.resolve({
            default: ({ loaders }) => (
              <div data-testid="probe">{String(loaders.marker)}</div>
            ),
            loaders: {
              marker: () => Promise.reject(new Error("loader kaboom")),
            },
            errorFallback: () => <div data-testid="probe">degraded</div>,
          }),
      }),
    );
  },
});

/**
 * The failing query span is recorded before the rejection escalates, so the
 * dev error page's database section can flag it.
 */
const failingQueryPlugin = definePlugin("acme-failing-query", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "acme/failing-query",
        view: () =>
          Promise.resolve({
            default: () => null,
            loaders: {
              rows: () =>
                getContext().telemetry.span("db: query", (s) => {
                  s.set("db.sql", "select * from broken");
                  return Promise.reject(new Error("no such table: broken"));
                }),
            },
          }),
      }),
    );
  },
});

/** What `block.loaderFailed` handed its subscriber, emptied before each test. */
const received: {
  block: string;
  key: string;
  error: unknown;
  url: string;
}[] = [];
const observer = definePlugin("acme-loader-observer", {
  setup: (ctx) => {
    ctx.events.on(block.loaderFailed, (failure, requestCtx) => {
      received.push({
        block: failure.spec.name,
        key: failure.key,
        error: failure.error,
        url: requestCtx.request.url,
      });
    });
  },
});

const throwingLoaderTheme = defineTheme({
  templates: [
    fallback(() => null),
    entry(({ data }) =>
      data.entry.contentBlocks ? (
        <BlockRenderer content={data.entry.contentBlocks} />
      ) : null,
    ),
  ],
});

function loaderPost(blockName: string) {
  return {
    type: "post",
    slug: "with-loader",
    title: "Loader Block",
    content: {
      version: "plumix.v2",
      blocks: [{ id: "boom", name: blockName, attrs: {} }],
    },
  } as const;
}

// The dev gate is read when the app is built, so the dev sites boot with it on.
vi.stubEnv("PLUMIX_DEV", "1");
const devSite = await testSite({
  plugins: [blogPlugin, throwingLoaderPlugin],
  config: { theme: throwingLoaderTheme },
});
const devQuerySite = await testSite({
  plugins: [blogPlugin, failingQueryPlugin],
  config: { theme: throwingLoaderTheme },
});
vi.stubEnv("PLUMIX_DEV", undefined);
const site = await testSite({
  plugins: [blogPlugin, throwingLoaderPlugin, observer],
  config: { theme: throwingLoaderTheme },
});

vi.unstubAllEnvs();

describe("a block loader that fails with the dev gate on", () => {
  beforeEach(() => {
    vi.stubEnv("PLUMIX_DEV", "1");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  test("fails to the dev error page naming the block", async () => {
    await devSite.factory.published.create(loaderPost("acme/throwing-loader"));

    const page = await devSite.visit("http://localhost:5173/post/with-loader");

    page
      .assertStatus(500)
      // The standalone dev page, not the silently-degraded block.
      .assertSee("plumix-dev-error")
      // It names the culprit block and surfaces the loader's own message.
      .assertSee("acme/throwing-loader")
      .assertSee("loader kaboom")
      // The block never rendered its degraded fallback — the page is fatal.
      .assertDontSee("degraded");
  });

  test("surfaces the failing loader query, flagged as failed", async () => {
    await devQuerySite.factory.published.create(
      loaderPost("acme/failing-query"),
    );

    const page = await devQuerySite.visit(
      "http://localhost:5173/post/with-loader",
    );

    // The database section shows the query the loader ran, flagged as failed —
    // the escalation throws only after the failing span is recorded.
    page
      .assertStatus(500)
      .assertSee("plumix-dev-error")
      .assertSee("select * from broken")
      .assertSee('data-testid="plumix-dev-error-query-failed"');
  });
});

describe("a block loader that fails with the dev gate off", () => {
  beforeEach(() => {
    received.length = 0;
  });

  test("stays isolated and the page renders", async () => {
    await site.factory.published.create(loaderPost("acme/throwing-loader"));

    const page = await site.visit("http://localhost:5173/post/with-loader");

    // Per-block isolation: the page renders, the block degrades to `{}`.
    page
      .assertOk()
      .assertSee('data-testid="probe"')
      .assertSee("degraded")
      .assertDontSee("plumix-dev-error");
  });

  test("hands a block.loaderFailed subscriber the failing loader and the request's ctx", async () => {
    await site.factory.published.create(loaderPost("acme/throwing-loader"));

    await site.visit("http://localhost:5173/post/with-loader");

    expect(received).toEqual([
      {
        block: "acme/throwing-loader",
        key: "marker",
        error: new Error("loader kaboom"),
        url: "http://localhost:5173/post/with-loader",
      },
    ]);
  });
});
