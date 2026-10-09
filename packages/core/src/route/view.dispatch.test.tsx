import { describe, expect, expectTypeOf, test, vi } from "vitest";

import type { CdnStore, ConnectedCdn } from "../runtime/contract/slots.js";
import type { ViewData } from "./contract/resolved-entry.js";
import { authenticatedPolicy } from "../access/policy.js";
import { definePlugin } from "../plugin/define.js";
import { defineTemplate } from "../template.js";
import { createDispatcherHarness } from "../test/dispatcher.js";
import { defineTheme } from "../theme.js";
import { redirectTo } from "./contract/page-outcome.js";
import { fallback, forView, notFound } from "./render/template-builders.js";

interface CompareShare {
  readonly products: readonly string[];
}
declare module "../template-registry.js" {
  interface ViewRegistry {
    compareShare: { data: CompareShare };
  }
}

// `/compare/:id` resolves a share the visitor was sent; `missing` names none.
const comparePlugin = definePlugin("compare", (ctx) => {
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
});

// A CDN whose store records every write.
function recordingCdn() {
  const put = vi.fn<CdnStore["put"]>(() => Promise.resolve());
  const cdn: ConnectedCdn = {
    decorate: (response) => response,
    store: { match: () => Promise.resolve(undefined), put },
  };
  return { cdn, put };
}

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

describe("views (registerView)", () => {
  test("a view's route renders its forView template with the params and the resolved data", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [comparePlugin], theme: compareTheme },
    });
    const seen = h.spyFilter("render:document");

    const response = await h.dispatch(
      new Request("https://cms.example/compare/abc"),
    );

    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('<h1 data-testid="share">abc</h1>');
    expect(body).toContain("kettle vs toaster");
    expect(body).toContain("<title>Comparison abc</title>");
    expect(body).toContain('<meta name="share" content="abc"');
    expect(seen.calls[0]?.rest[0]).toMatchObject({
      kind: "view",
      name: "compareShare",
      params: { id: "abc" },
    });
  });

  test("a resolve returning null answers the theme's 404", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [comparePlugin],
        theme: defineTheme({
          templates: [
            notFound(() => <h1>Nothing here</h1>),
            fallback(() => null),
          ],
        }),
      },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/compare/missing", {
        headers: { accept: "text/html" },
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.text()).toContain("<h1>Nothing here</h1>");
  });

  test("a resolve throwing redirectTo answers 302 and nothing stores it", async () => {
    const { cdn, put } = recordingCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [comparePlugin], theme: compareTheme },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/compare/home"),
    );
    await h.drainDeferred();

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(put).not.toHaveBeenCalled();
  });

  test("with no forView template, the theme's fallback renders the view", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [comparePlugin],
        theme: defineTheme({
          templates: [
            fallback(({ data }) => (
              <p data-testid="fallback">{data.kind === "view" && data.name}</p>
            )),
          ],
        }),
      },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/compare/abc"),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain(
      '<p data-testid="fallback">compareShare</p>',
    );
  });

  test("a view is never stored by the CDN unless it is cacheable", async () => {
    const { cdn, put } = recordingCdn();
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [comparePlugin], theme: compareTheme },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/compare/abc"),
    );
    await h.drainDeferred();

    expect(response.status).toBe(200);
    expect(put).not.toHaveBeenCalled();
  });

  test("a cacheable view is stored under the tags of what its resolve read", async () => {
    const { cdn, put } = recordingCdn();
    const cacheablePlugin = definePlugin("compare", (ctx) => {
      ctx.registerView("compareShare", {
        routes: ["/compare/:id"],
        cacheable: true,
        resolve: () => ({
          data: { products: ["kettle"] },
          title: "Comparison",
          reads: [{ kind: "entryType", type: "product" }],
        }),
      });
    });
    const h = await createDispatcherHarness({
      cdn,
      config: { plugins: [cacheablePlugin], theme: compareTheme },
    });

    await h.dispatch(new Request("https://cms.example/compare/abc"));
    await h.drainDeferred();

    expect(put).toHaveBeenCalledOnce();
    const tags = (put.mock.calls[0] as unknown[])[2] as readonly string[];
    expect(tags).toContain("t:product");
  });

  test("a view with access redirects an anonymous visitor to sign-in", async () => {
    const accountPlugin = definePlugin("account", (ctx) => {
      ctx.registerView("account", {
        routes: ["/account"],
        access: authenticatedPolicy,
        resolve: () => ({ data: null, title: "Your account" }),
      });
    });
    const h = await createDispatcherHarness({
      config: { plugins: [accountPlugin], theme: compareTheme },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/account"),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "/_plumix/admin/login?redirectTo=%2Faccount",
    );
  });

  test("a view page has no automatic canonical link", async () => {
    const h = await createDispatcherHarness({
      config: { plugins: [comparePlugin], theme: compareTheme },
    });

    const response = await h.dispatch(
      new Request("https://cms.example/compare/abc"),
    );

    expect(await response.text()).not.toContain('rel="canonical"');
  });

  test("a view document declaring a canonical link renders it", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [comparePlugin],
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

    const response = await h.dispatch(
      new Request("https://cms.example/compare/abc"),
    );

    expect(await response.text()).toContain(
      '<link rel="canonical" href="https://cms.example/c"/>',
    );
  });

  test("two plugins registering the same view name fail boot naming both", async () => {
    const other = definePlugin("other", (ctx) => {
      ctx.registerView("compareShare", {
        routes: ["/elsewhere"],
        resolve: () => null,
      });
    });

    await expect(
      createDispatcherHarness({ config: { plugins: [comparePlugin, other] } }),
    ).rejects.toThrow(/compare.*other|other.*compare/);
  });

  test("a view route clashing with an archive type's fails boot naming both", async () => {
    const archives = definePlugin("archives", (ctx) => {
      ctx.registerArchiveType("comparisons", {
        routes: ["/compare/:id"],
        resolve: () => null,
      });
    });

    await expect(
      createDispatcherHarness({
        config: { plugins: [comparePlugin, archives] },
      }),
    ).rejects.toThrow(
      'Rewrite rule "/compare/:id" is registered twice (by plugin "archives" and plugin "compare").',
    );
  });
});

describe("views — typing", () => {
  test("forView accepts any name and types data.data from ViewRegistry", () => {
    forView("undeclared").template(({ data }) => {
      expectTypeOf(data).toEqualTypeOf<ViewData>();
      expectTypeOf(data.kind).toEqualTypeOf<"view">();
      return null;
    });
    forView("compareShare").template(({ data }) => {
      expectTypeOf(data.data).toEqualTypeOf<CompareShare>();
      expectTypeOf(data.params).toEqualTypeOf<
        Readonly<Record<string, string>>
      >();
      return null;
    });
  });

  test("registerView holds a declared view's resolver to its data", () => {
    definePlugin("typed", (ctx) => {
      ctx.registerView("compareShare", {
        routes: ["/c/:id"],
        // @ts-expect-error - compareShare's data is a CompareShare
        resolve: () => ({ data: { nope: 1 }, title: "x" }),
      });
      ctx.registerView("anything", {
        routes: ["/a"],
        resolve: () => ({ data: 42, title: "x" }),
      });
    });
  });
});
