import { describe, expect, test } from "vitest";

import type { TemplateData } from "../../src/theme.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entry,
  fallback,
  notFound,
  serverError,
} from "../../src/route/render/template-builders.js";
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

const titledSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null)],
      document: { titleTemplate: "%s · Plumix", title: "Q&A: $& explained" },
    }),
  },
});

describe("a page title", () => {
  test("a `$&` in a title is text, not a replacement pattern", async () => {
    const page = await titledSite.visit("/");

    page.assertSee("<title>Q&amp;A: $&amp; explained · Plumix</title>");
  });
});

/** Error templates that print what the theme was handed. */
const themedSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(() => {
          throw new Error("kaboom-secret-payload");
        }),
        notFound(({ data }) => (
          <main data-testid="four-oh-four">
            <h1>Page missing</h1>
            <code data-testid="hint">{data.hint ?? ""}</code>
            <code data-testid="error-id">{data.errorId ?? ""}</code>
          </main>
        )),
        serverError(({ data }) => (
          <main data-testid="five-oh-oh">
            <h1>Server error</h1>
            <p data-testid="hint">{data.hint ?? ""}</p>
            <p data-testid="error-id">{data.errorId ?? ""}</p>
          </main>
        )),
      ],
      document: { titleTemplate: "%s · Plumix" },
    }),
  },
});

describe("a theme's error templates", () => {
  test("404 page composes its title through the theme titleTemplate", async () => {
    const page = await themedSite.visit("/never-existed");

    page.assertNotFound().assertSee("<title>Not Found · Plumix</title>");
  });

  test("an error page declares no canonical of its own", async () => {
    const page = await themedSite.visit("/never-existed");

    // A URL that resolved to nothing must not tell a crawler it is the
    // canonical address of anything.
    page.assertDontSee('rel="canonical"');
  });

  test("registered `404` template renders for an unmatched URL", async () => {
    const page = await themedSite.visit("/post/never-existed");

    page
      .assertNotFound()
      .assertSee('data-testid="four-oh-four"')
      .assertSee("Page missing")
      // A 404 is not a failure to correlate — no error id is threaded to it.
      .assertSee('data-testid="error-id"></code>');
  });

  test("themed 404 preserves the `x-plumix-hint` diagnostic header", async () => {
    const page = await themedSite.visit("/post/never-existed");

    page
      .assertNotFound()
      .assertHeader("x-plumix-hint", "public-post-not-found");
  });

  test("theme template that throws renders the `500` template + 500 status", async () => {
    await themedSite.factory.published.create({
      type: "post",
      slug: "boom",
      title: "Boom",
    });

    const page = await themedSite.visit("/post/boom");

    // The 5xx payload reaches the theme with the request's correlation id,
    // not exception detail.
    const requestId = themedSite.telemetry.snapshots[0]?.request.requestId;
    page
      .assertStatus(500)
      .assertSee('data-testid="five-oh-oh"')
      .assertSee(`data-testid="error-id">${String(requestId)}<`)
      .assertDontSee("kaboom-secret-payload");
  });
});

const seen: TemplateData["kind"][] = [];
const headWriter = definePlugin("head-writer", {
  setup: (ctx) => {
    ctx.filters.add(render.document, (manifest, { data }) => {
      seen.push(data.kind);
      return {
        ...manifest,
        meta: [
          ...(manifest.meta ?? []),
          { name: "robots", content: "noindex,follow" },
        ],
      };
    });
  },
});

const headWrittenSite = await testSite({
  plugins: [blogPlugin, headWriter],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null), notFound(() => <main />)],
    }),
  },
});

describe("an error page's document", () => {
  test("an error page runs the `render.document` chain like any other", async () => {
    const page = await headWrittenSite.visit("/never-existed");

    page
      .assertNotFound()
      .assertSee('<meta name="robots" content="noindex,follow"/>');
    expect(seen).toContain("error");
  });
});

const brokenHeadPlugin = definePlugin("broken-head", {
  setup: (ctx) => {
    ctx.filters.add(render.document, () => {
      throw new Error("subscriber blew up");
    });
  },
});

const brokenHeadSite = await testSite({
  plugins: [blogPlugin, brokenHeadPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null), notFound(() => <main />)],
    }),
  },
});

describe("an error page whose head plugin throws", () => {
  test("a throwing head plugin leaves the 404 a 404", async () => {
    const page = await brokenHeadSite.visit("/never-existed");

    // `apply` does not isolate a throw, and this render is already the
    // failure path — escalating it would hide the 404 behind a 500.
    page.assertNotFound();
    brokenHeadSite.logger.assertLogged(
      "error",
      "render.document failed on the error page",
    );
  });
});

const reservedHeadPlugin = definePlugin("reserved-head", {
  setup: (ctx) => {
    ctx.filters.add(render.document, (manifest) => ({
      ...manifest,
      meta: [
        ...(manifest.meta ?? []),
        { name: "viewport", content: "width=320" },
      ],
    }));
  },
});

const reservedHeadSite = await testSite({
  plugins: [blogPlugin, reservedHeadPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null), notFound(() => <main />)],
    }),
  },
});

describe("an error page whose head plugin writes a reserved meta name", () => {
  test("the entry is logged and the unfiltered document renders one viewport tag", async () => {
    const page = await reservedHeadSite.visit("/never-existed");

    page.assertNotFound().assertDontSee("width=320");
    expect(page.body.match(/<meta name="viewport"/g)).toHaveLength(1);
    reservedHeadSite.logger.assertLogged(
      "error",
      "render.document failed on the error page",
    );
  });
});

const builtInSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(() => {
          throw new Error("kaboom-different-payload");
        }),
      ],
    }),
  },
});

describe("a theme without error templates", () => {
  test("built-in 404 default renders when the theme has no `404` template", async () => {
    const page = await builtInSite.visit("/post/never-existed");

    // Sanity: it's the built-in shell, not an empty 404.
    page.assertNotFound().assertSee("<!doctype html>").assertSee("Not Found");
  });

  test("built-in 500 default renders when the theme has no `500` template", async () => {
    await builtInSite.factory.published.create({
      type: "post",
      slug: "boom2",
      title: "Boom2",
    });

    const page = await builtInSite.visit("/post/boom2");

    // The built-in 500 page prints the request's correlation id even with no
    // `500` template.
    const requestId = builtInSite.telemetry.snapshots[0]?.request.requestId;
    page
      .assertStatus(500)
      .assertSee("<!doctype html>")
      .assertSee("Internal Server Error")
      .assertSee(String(requestId))
      .assertDontSee("kaboom-different-payload");
  });
});

const throwingResolver = definePlugin("throwing-resolver", {
  setup: (ctx) => {
    ctx.filters.add(render.single, () => {
      throw new Error("kaboom-resolver-secret");
    });
  },
});

const resolverSite = await testSite({
  plugins: [blogPlugin, throwingResolver],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <h1>{data.entry.title}</h1>),
        serverError(() => <main data-testid="five-oh-oh" />),
      ],
    }),
  },
});

describe("a resolver that throws", () => {
  test("a resolver-side throw renders the themed `500` template, not JSON", async () => {
    await resolverSite.factory.published.create({
      type: "post",
      slug: "boom-resolver",
      title: "Boom Resolver",
    });

    const page = await resolverSite.visit("/post/boom-resolver");

    page
      .assertStatus(500)
      .assertHeader("content-type", "text/html; charset=utf-8")
      .assertSee('data-testid="five-oh-oh"')
      .assertDontSee("kaboom-resolver-secret");
  });
});

const doubleThrowSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(() => {
          throw new Error("kaboom-inner-secret");
        }),
        serverError(() => {
          throw new Error("kaboom-error-template-secret");
        }),
      ],
    }),
  },
});

describe("a `500` template that throws too", () => {
  test("falls back to plaintext 500 when the theme's `500` template also throws", async () => {
    await doubleThrowSite.factory.published.create({
      type: "post",
      slug: "double-boom",
      title: "Double Boom",
    });

    const page = await doubleThrowSite.visit("/post/double-boom");

    page
      .assertStatus(500)
      .assertHeader("content-type", "text/plain; charset=utf-8")
      .assertSee("Internal Server Error")
      .assertDontSee("kaboom-inner-secret")
      .assertDontSee("kaboom-error-template-secret");
  });
});
