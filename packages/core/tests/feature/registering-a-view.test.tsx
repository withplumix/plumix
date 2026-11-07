import { describe, expect, test } from "vitest";

import { authenticatedPolicy } from "../../src/access/policy.js";
import { render } from "../../src/events-and-filters/render.js";
import { definePlugin } from "../../src/plugin/define.js";
import { redirectTo } from "../../src/route/contract/page-outcome.js";
import {
  fallback,
  forView,
  notFound,
} from "../../src/route/render/template-builders.js";
import { defineTemplate } from "../../src/template.js";
import { testSite } from "../../src/test/site.js";
import { defineTheme } from "../../src/theme.js";

interface CompareShare {
  readonly products: readonly string[];
}
declare module "../../src/template-registry.js" {
  interface ViewRegistry {
    compareShare: { data: CompareShare };
  }
}

/**
 * `/compare/:id` resolves a share the visitor was sent; `missing` names none.
 */
const comparePlugin = definePlugin("compare", {
  setup: (ctx) => {
    ctx.registerView("compareShare", {
      routes: ["/compare/:id"],
      resolve: (_appCtx, params) => {
        if (params.id === "missing") return null;
        if (params.id === "home") throw redirectTo("/");
        return {
          data: { products: ["kettle", "toaster"] },
          title: `Comparison ${params.id}`,
        };
      },
    });
  },
});

const accountPlugin = definePlugin("account", {
  setup: (ctx) => {
    ctx.registerView("account", {
      routes: ["/account"],
      access: authenticatedPolicy,
      resolve: () => ({ data: null, title: "Your account" }),
    });
  },
});

const compareTheme = defineTheme({
  templates: [
    forView("compareShare").template(
      defineTemplate({
        document: ({ data }) => ({
          meta: [{ name: "share", content: data.params.id }],
        }),
        render: ({ data }) => (
          <main>
            <h1 data-testid="share">{data.params.id}</h1>
            <p>{data.data.products.join(" vs ")}</p>
          </main>
        ),
      }),
    ),
    fallback(() => null),
  ],
});

const site = await testSite({
  plugins: [comparePlugin, accountPlugin],
  config: { theme: compareTheme },
});

describe("views (registerView)", () => {
  test("a view's route renders its forView template with the params and the resolved data", async () => {
    const page = await site.visit("/compare/abc");

    page
      .assertOk()
      .assertSee('<h1 data-testid="share">abc</h1>')
      .assertSee("kettle vs toaster")
      .assertSee("<title>Comparison abc</title>")
      .assertSee('<meta name="share" content="abc"');
    site.filters.assertApplied(render.document, {
      data: { kind: "view", name: "compareShare", params: { id: "abc" } },
    });
  });

  test("a resolve throwing redirectTo answers 302 and nothing stores it", async () => {
    const page = await site.visit("/compare/home");

    page.assertStatus(302).assertRedirect("/");
    site.cdn.assertNotStored("/compare/home");
  });

  test("a view is never stored by the CDN unless it is cacheable", async () => {
    const page = await site.visit("/compare/abc");

    page.assertOk();
    site.cdn.assertNotStored("/compare/abc");
  });

  test("a view with access redirects an anonymous visitor to sign-in", async () => {
    const page = await site.visit("/account");

    page
      .assertStatus(302)
      .assertRedirect("/_plumix/admin/login?redirectTo=%2Faccount");
  });

  test("a view page has no automatic canonical link", async () => {
    const page = await site.visit("/compare/abc");

    page.assertDontSee('rel="canonical"');
  });

  test("two plugins registering the same view name fail boot naming both", async () => {
    const other = definePlugin("other", {
      setup: (ctx) => {
        ctx.registerView("compareShare", {
          routes: ["/elsewhere"],
          resolve: () => null,
        });
      },
    });

    await expect(testSite({ plugins: [comparePlugin, other] })).rejects.toThrow(
      /compare.*other|other.*compare/,
    );
  });

  test("a view route clashing with an archive type's fails boot naming both", async () => {
    const archives = definePlugin("archives", {
      setup: (ctx) => {
        ctx.registerArchiveType("comparisons", {
          routes: ["/compare/:id"],
          resolve: () => null,
        });
      },
    });

    await expect(
      testSite({ plugins: [comparePlugin, archives] }),
    ).rejects.toThrow(
      'Rewrite rule "/compare/:id" is registered twice (by plugin "archives" and plugin "compare").',
    );
  });
});

const notFoundSite = await testSite({
  plugins: [comparePlugin],
  config: {
    theme: defineTheme({
      templates: [notFound(() => <h1>Nothing here</h1>), fallback(() => null)],
    }),
  },
});

describe("a view whose resolve finds nothing", () => {
  test("a resolve returning null answers the theme's 404", async () => {
    const page = await notFoundSite.visit("/compare/missing", {
      headers: { accept: "text/html" },
    });

    page.assertNotFound().assertSee("<h1>Nothing here</h1>");
  });
});

const fallbackSite = await testSite({
  plugins: [comparePlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(({ data }) => (
          <p data-testid="fallback">{data.kind === "view" && data.name}</p>
        )),
      ],
    }),
  },
});

describe("a view with no forView template", () => {
  test("with no forView template, the theme's fallback renders the view", async () => {
    const page = await fallbackSite.visit("/compare/abc");

    page.assertOk().assertSee('<p data-testid="fallback">compareShare</p>');
  });
});

const cacheablePlugin = definePlugin("compare", {
  setup: (ctx) => {
    ctx.registerView("compareShare", {
      routes: ["/compare/:id"],
      cacheable: true,
      resolve: () => ({
        data: { products: ["kettle"] },
        title: "Comparison",
        tags: ["t:product"],
      }),
    });
  },
});

const cacheableSite = await testSite({
  plugins: [cacheablePlugin],
  config: { theme: compareTheme },
});

describe("a cacheable view", () => {
  test("a cacheable view is stored under the tags its resolve returned", async () => {
    const page = await cacheableSite.visit("/compare/abc");

    cacheableSite.cdn.assertStored("/compare/abc");
    // The tags it was stored under, as the cdn decorates a miss with them.
    page.assertHeader("cache-tag", "t:product,s:site");
  });
});

const canonicalSite = await testSite({
  plugins: [comparePlugin],
  config: {
    theme: defineTheme({
      templates: [
        forView("compareShare").template(
          defineTemplate({
            document: () => ({
              link: [{ rel: "canonical", href: "https://cms.example/c" }],
            }),
            render: () => <main />,
          }),
        ),
        fallback(() => null),
      ],
    }),
  },
});

describe("a view document declaring a canonical link", () => {
  test("a view document declaring a canonical link renders it", async () => {
    const page = await canonicalSite.visit("/compare/abc");

    page.assertSee('<link rel="canonical" href="https://cms.example/c"/>');
  });
});
