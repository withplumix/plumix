import type { JsonValue, TemplateData, ThemeDescriptor } from "plumix";
import type { PluginDescriptor } from "plumix/plugin";
import type { DispatcherHarness } from "plumix/test";
import { defineTheme, fallback } from "plumix";
import { definePlugin } from "plumix/plugin";
import { createDispatcherHarness } from "plumix/test";
import { describe, expect, test } from "vitest";

import type { SchemaPiece } from "./schema.js";
import { Breadcrumbs } from "./breadcrumbs.js";
import { seo } from "./index.js";

const blogPlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
    supports: ["title", "editor", "excerpt"],
  });
  ctx.registerTermTaxonomy("category", {
    label: "Categories",
    isHierarchical: false,
    entryTypes: ["post"],
  });
});

const theme = defineTheme({ templates: [fallback(() => null)] });

// The trail as a theme would draw it, so one render carries both the rendered
// crumbs and the `BreadcrumbList` that claims them.
const trailTheme = defineTheme({
  templates: [
    fallback(({ data }: { readonly data: TemplateData }) => (
      <Breadcrumbs data={data} />
    )),
  ],
});

function createHarness(
  plugins: readonly PluginDescriptor[] = [blogPlugin, seo()],
  themeOverride: ThemeDescriptor = theme,
): Promise<DispatcherHarness> {
  return createDispatcherHarness({ plugins, theme: themeOverride });
}

async function seedPost(
  h: DispatcherHarness,
  overrides: {
    readonly slug?: string;
    readonly title?: string;
    readonly excerpt?: string;
    readonly meta?: Record<string, JsonValue>;
  } = {},
): Promise<void> {
  const author = await h.factory.user.create({
    role: "admin",
    name: "Ada Lovelace",
  });
  await h.factory.entry.create({
    type: "post",
    slug: overrides.slug ?? "hello",
    title: overrides.title ?? "Hello",
    ...(overrides.excerpt === undefined ? {} : { excerpt: overrides.excerpt }),
    ...(overrides.meta === undefined ? {} : { meta: overrides.meta }),
    content: null,
    status: "published",
    authorId: author.id,
    publishedAt: new Date("2026-01-02T03:04:05.000Z"),
  });
}

/** One node of the emitted graph, as a crawler would read it back. */
interface GraphNode {
  readonly "@type": string;
  readonly "@id": string;
  readonly [key: string]: unknown;
}

const LD_SCRIPT = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/;

function headOf(html: string): string {
  return html.slice(html.indexOf("<head>"), html.indexOf("</head>"));
}

/** The script body exactly as it was written into the page. */
function scriptBodyOf(head: string): string {
  return LD_SCRIPT.exec(head)?.[1] ?? "";
}

/** The graph as it left the page: parsed out of the rendered script, not read
 * off an internal object. */
function parseGraph(head: string): readonly GraphNode[] {
  const match = LD_SCRIPT.exec(head);
  if (match === null) return [];
  const doc = JSON.parse(match[1] ?? "") as {
    readonly "@context": string;
    readonly "@graph": readonly GraphNode[];
  };
  expect(doc["@context"]).toBe("https://schema.org");
  return doc["@graph"];
}

async function graphAt(
  h: DispatcherHarness,
  url: string,
): Promise<readonly GraphNode[]> {
  const res = await h.dispatch(new Request(url));
  return parseGraph(headOf(await res.text()));
}

async function headAt(h: DispatcherHarness, url: string): Promise<string> {
  const res = await h.dispatch(new Request(url));
  return headOf(await res.text());
}

function byType(
  graph: readonly GraphNode[],
  type: string,
): GraphNode | undefined {
  return graph.find((node) => node["@type"] === type);
}

function idsOf(graph: readonly GraphNode[]): readonly string[] {
  return graph.map((node) => node["@id"]);
}

const POST_URL = "https://cms.example/post/hello";

describe("the structured-data graph", () => {
  test("an entry page emits pieces that reference each other by fragment", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "site",
      key: "title",
      value: "Demo",
    });
    await seedPost(h, {
      excerpt: "My excerpt",
      meta: { seo_og_image: "https://cms.example/chosen.png" },
    });

    const graph = await graphAt(h, POST_URL);
    const ids = idsOf(graph);

    expect(byType(graph, "WebSite")?.["@id"]).toBe(
      "https://cms.example/#website",
    );
    expect(byType(graph, "Organization")?.["@id"]).toBe(
      "https://cms.example/#organization",
    );

    const webpage = byType(graph, "WebPage");
    expect(webpage?.["@id"]).toBe(`${POST_URL}#webpage`);
    expect(webpage?.isPartOf).toEqual({
      "@id": "https://cms.example/#website",
    });
    expect(webpage?.primaryImageOfPage).toEqual({
      "@id": `${POST_URL}#primaryimage`,
    });
    expect(webpage?.breadcrumb).toEqual({ "@id": `${POST_URL}#breadcrumb` });

    const article = byType(graph, "Article");
    expect(article?.mainEntityOfPage).toEqual({ "@id": `${POST_URL}#webpage` });
    expect(article?.headline).toBe("Hello");
    expect(article?.description).toBe("My excerpt");
    expect(article?.datePublished).toBe("2026-01-02T03:04:05.000Z");
    expect(article?.publisher).toEqual({
      "@id": "https://cms.example/#organization",
    });

    // Every reference resolves to a piece that is actually in the graph.
    for (const node of graph) {
      for (const value of Object.values(node)) {
        if (typeof value !== "object" || value === null) continue;
        const id = (value as { readonly "@id"?: unknown })["@id"];
        if (typeof id === "string") expect(ids).toContain(id);
      }
    }
  });

  test("the byline and the image are their own addressable pieces", async () => {
    const h = await createHarness();
    await seedPost(h, {
      meta: { seo_og_image: "https://cms.example/chosen.png" },
    });

    const graph = await graphAt(h, POST_URL);

    const person = byType(graph, "Person");
    expect(person?.name).toBe("Ada Lovelace");
    expect(byType(graph, "Article")?.author).toEqual({
      "@id": person?.["@id"],
    });

    const image = byType(graph, "ImageObject");
    expect(image?.["@id"]).toBe(`${POST_URL}#primaryimage`);
    expect(image?.contentUrl).toBe("https://cms.example/chosen.png");
  });

  test("a page with no social image carries neither the piece nor a reference to it", async () => {
    const h = await createHarness();
    await seedPost(h);

    const graph = await graphAt(h, POST_URL);

    expect(byType(graph, "ImageObject")).toBeUndefined();
    expect(byType(graph, "WebPage")?.primaryImageOfPage).toBeUndefined();
    expect(byType(graph, "Article")?.image).toBeUndefined();
  });

  test("the site default social image is not a picture of any one page", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "default_og_image",
      value: "https://cms.example/og.png",
    });
    await seedPost(h);

    const head = await headAt(h, POST_URL);

    // It is still what the page is shared with — it is just not what the page
    // is a picture of.
    expect(head).toContain(
      '<meta property="og:image" content="https://cms.example/og.png"/>',
    );
    expect(byType(parseGraph(head), "ImageObject")).toBeUndefined();
  });

  test("a site with no title publishes no name rather than its own URL", async () => {
    const h = await createHarness();
    await seedPost(h);

    const graph = await graphAt(h, POST_URL);

    expect(byType(graph, "WebSite")?.name).toBeUndefined();
    expect(byType(graph, "Organization")?.name).toBeUndefined();
  });

  test("a non-entry page emits the site-level graph without article pieces", async () => {
    const h = await createHarness();
    await seedPost(h);

    const graph = await graphAt(h, "https://cms.example/post");

    expect(byType(graph, "WebSite")).toBeDefined();
    expect(byType(graph, "Organization")).toBeDefined();
    expect(byType(graph, "WebPage")).toBeDefined();
    expect(byType(graph, "Article")).toBeUndefined();
    expect(byType(graph, "Person")).toBeUndefined();
  });

  test("identifiers are stable across renders of the same URL", async () => {
    const h = await createHarness();
    await seedPost(h);

    expect(idsOf(await graphAt(h, POST_URL))).toEqual(
      idsOf(await graphAt(h, POST_URL)),
    );
  });

  test("the site can say it represents a person instead", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "represents",
      value: "person",
    });
    await seedPost(h);

    const graph = await graphAt(h, POST_URL);

    expect(byType(graph, "Organization")).toBeUndefined();
    expect(byType(graph, "WebSite")?.publisher).toEqual({
      "@id": "https://cms.example/#person",
    });
  });

  test("no graph at all without the plugin installed", async () => {
    const h = await createHarness([blogPlugin]);
    await seedPost(h);

    expect(await headAt(h, POST_URL)).not.toContain("application/ld+json");
  });

  test("a theme that wrote its own script keeps it to itself", async () => {
    const h = await createHarness(
      [blogPlugin, seo()],
      defineTheme({
        templates: [fallback(() => null)],
        document: {
          script: [
            {
              type: "application/ld+json",
              position: "headEnd",
              children: '{"@context":"https://schema.org"}',
            },
          ],
        },
      }),
    );
    await seedPost(h);

    const head = await headAt(h, POST_URL);

    expect(head.match(/application\/ld\+json/g)).toHaveLength(1);
    expect(head).toContain('{"@context":"https://schema.org"}');
  });
});

describe("a page held out of the index", () => {
  test("an entry marked noindex advertises no structured data", async () => {
    const h = await createHarness();
    await seedPost(h, { meta: { seo_noindex: true } });

    const head = await headAt(h, POST_URL);

    expect(head).toContain('<meta name="robots" content="noindex,follow"/>');
    expect(head).not.toContain("application/ld+json");
  });

  test("a search-results page advertises none either", async () => {
    const h = await createHarness();
    await seedPost(h);

    const head = await headAt(h, "https://cms.example/search/anything");

    expect(head).toContain('<meta name="robots" content="noindex,follow"/>');
    expect(head).not.toContain("application/ld+json");
  });

  test("nofollow on its own is not a reason to withhold one", async () => {
    const h = await createHarness();
    await seedPost(h, { meta: { seo_nofollow: true } });

    const head = await headAt(h, POST_URL);

    expect(head).toContain(
      '<meta name="robots" content="index,nofollow,max-image-preview:large"/>',
    );
    expect(byType(parseGraph(head), "Article")).toBeDefined();
  });

  test("a private site advertises none either", async () => {
    const h = await createHarness();
    await h.factory.setting.create({
      group: "seo",
      key: "indexable",
      value: false,
    });
    await seedPost(h);

    expect(await headAt(h, POST_URL)).not.toContain("application/ld+json");
  });
});

describe("serialization", () => {
  test("a hostile title cannot escape the script element", async () => {
    const h = await createHarness();
    const hostile = '</script><script>alert("xss")</script>';
    await seedPost(h, { title: hostile });

    const head = await headAt(h, POST_URL);

    // One script open and one close: the title did not add a pair.
    expect(head.match(/<script/g)).toHaveLength(1);
    expect(head.match(/<\/script>/g)).toHaveLength(1);
    expect(byType(parseGraph(head), "Article")?.headline).toBe(hostile);
  });

  test("a line separator in a title does not break the script body", async () => {
    const h = await createHarness();
    const separated = "Before\u2028after\u2029end";
    await seedPost(h, { title: separated });

    const head = await headAt(h, POST_URL);

    // Asserted on the script body alone: both characters are legal in the
    // `<title>` core writes, and only a script body cannot carry them.
    expect(scriptBodyOf(head)).not.toContain("\u2028");
    expect(scriptBodyOf(head)).not.toContain("\u2029");
    expect(byType(parseGraph(head), "Article")?.headline).toBe(separated);
  });
});

describe("the three filter tiers", () => {
  test("a plugin can drop a piece", async () => {
    const dropper = definePlugin("drop-breadcrumb", (ctx) => {
      ctx.addFilter("seo:schema:needs", (needed, piece) =>
        piece === "breadcrumb" ? false : needed,
      );
    });
    const h = await createHarness([blogPlugin, seo(), dropper]);
    await seedPost(h);

    const graph = await graphAt(h, POST_URL);

    expect(byType(graph, "BreadcrumbList")).toBeUndefined();
    expect(byType(graph, "WebPage")).toBeDefined();
  });

  test("a plugin can reshape one piece", async () => {
    const reshaper = definePlugin("reshape-publisher", (ctx) => {
      ctx.addFilter("seo:schema:piece", (piece, name) =>
        name === "publisher"
          ? { ...piece, sameAs: ["https://example.social/@demo"] }
          : piece,
      );
    });
    const h = await createHarness([blogPlugin, seo(), reshaper]);
    await seedPost(h);

    const graph = await graphAt(h, POST_URL);

    expect(byType(graph, "Organization")?.sameAs).toEqual([
      "https://example.social/@demo",
    ]);
    // The reshaped piece keeps the `@id` the rest of the graph points at.
    expect(byType(graph, "Organization")?.["@id"]).toBe(
      "https://cms.example/#organization",
    );
  });

  test("a plugin can transform the whole graph", async () => {
    const transformer = definePlugin("add-node", (ctx) => {
      ctx.addFilter("seo:schema:graph", (graph) => [
        ...graph,
        {
          "@type": "Product",
          "@id": "https://cms.example/#product",
          name: "A thing",
        } satisfies SchemaPiece,
      ]);
    });
    const h = await createHarness([blogPlugin, seo(), transformer]);
    await seedPost(h);

    const graph = await graphAt(h, POST_URL);

    expect(byType(graph, "Product")?.name).toBe("A thing");
    expect(byType(graph, "Article")).toBeDefined();
  });

  test("an emptied graph emits no script", async () => {
    const silencer = definePlugin("silence", (ctx) => {
      ctx.addFilter("seo:schema:graph", () => []);
    });
    const h = await createHarness([blogPlugin, seo(), silencer]);
    await seedPost(h);

    expect(await headAt(h, POST_URL)).not.toContain("application/ld+json");
  });
});

describe("the per-entry schema type", () => {
  test("an entry is an Article unless it says otherwise", async () => {
    const h = await createHarness();
    await seedPost(h);

    expect(byType(await graphAt(h, POST_URL), "Article")).toBeDefined();
  });

  test("a chosen type overrides the inferred one", async () => {
    const h = await createHarness();
    await seedPost(h, { meta: { seo_schema_type: "NewsArticle" } });

    const graph = await graphAt(h, POST_URL);

    expect(byType(graph, "Article")).toBeUndefined();
    const news = byType(graph, "NewsArticle");
    // Retyped, but still the same node: the references do not move.
    expect(news?.["@id"]).toBe(`${POST_URL}#article`);
    expect(news?.mainEntityOfPage).toEqual({ "@id": `${POST_URL}#webpage` });
  });
});

describe("breadcrumbs", () => {
  test("the rendered trail and the structured data agree", async () => {
    const h = await createHarness([blogPlugin, seo()], trailTheme);
    await seedPost(h);

    const res = await h.dispatch(new Request(POST_URL));
    const html = await res.text();

    const nav = /<nav[^>]*data-plumix-breadcrumbs[\s\S]*?<\/nav>/.exec(html);
    const rendered = [
      ...(nav?.[0] ?? "").matchAll(/<li>(?:<a[^>]*>)?([^<]*)/g),
    ].map((m) => m[1]);
    const list = byType(parseGraph(headOf(html)), "BreadcrumbList");
    const items = (list?.itemListElement ?? []) as readonly {
      readonly position: number;
      readonly name: string;
    }[];

    expect(rendered).toEqual(["Home", "Posts", "Hello"]);
    expect(items.map((item) => item.name)).toEqual(rendered);
    expect(items.map((item) => item.position)).toEqual([1, 2, 3]);
  });

  test("the last step is unlinked in both", async () => {
    const h = await createHarness([blogPlugin, seo()], trailTheme);
    await seedPost(h);

    const res = await h.dispatch(new Request(POST_URL));
    const html = await res.text();

    expect(html).toContain("<li>Hello</li>");
    expect(html).toContain('<li><a href="https://cms.example/post">Posts</a>');

    const items = byType(parseGraph(headOf(html)), "BreadcrumbList")
      ?.itemListElement as readonly { readonly item?: string }[];
    expect(items.at(-1)?.item).toBeUndefined();
    expect(items.at(-2)?.item).toBe("https://cms.example/post");
  });

  test("a term archive's trail names the term", async () => {
    const h = await createHarness([blogPlugin, seo()], trailTheme);
    await h.factory.term.create({
      taxonomy: "category",
      name: "News",
      slug: "news",
    });

    const res = await h.dispatch(
      new Request("https://cms.example/category/news"),
    );
    const html = await res.text();

    const items = byType(parseGraph(headOf(html)), "BreadcrumbList")
      ?.itemListElement as readonly { readonly name: string }[];
    expect(items.map((item) => item.name)).toEqual(["Home", "News"]);
  });

  test("a type with no route of its own contributes no step", async () => {
    // Public enough to render through a plugin's own route, but with no
    // archive route for a crumb to link: the router skips a non-public type
    // before it ever asks about `hasArchive`.
    const hidden = definePlugin("hidden", (ctx) => {
      ctx.registerEntryType("secret", {
        label: "Secrets",
        isPublic: false,
        hasArchive: true,
        supports: ["title"],
      });
    });
    const h = await createHarness([blogPlugin, hidden, seo()], trailTheme);
    await seedPost(h);

    const res = await h.dispatch(new Request(POST_URL));
    const items = byType(parseGraph(headOf(await res.text())), "BreadcrumbList")
      ?.itemListElement as readonly { readonly item?: string }[];

    // The post's own trail is unaffected; nothing links `/secret`.
    expect(items.map((item) => item.item)).toEqual([
      "https://cms.example/",
      "https://cms.example/post",
      undefined,
    ]);
  });

  test("the front page draws no trail and claims none", async () => {
    const h = await createHarness([blogPlugin, seo()], trailTheme);
    await seedPost(h);

    const res = await h.dispatch(new Request("https://cms.example/"));
    const html = await res.text();

    expect(html).not.toContain("data-plumix-breadcrumbs");
    expect(byType(parseGraph(headOf(html)), "BreadcrumbList")).toBeUndefined();
    expect(
      byType(parseGraph(headOf(html)), "WebPage")?.breadcrumb,
    ).toBeUndefined();
  });
});
