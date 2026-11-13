import { createElement, useId } from "react";
import { describe, expect, test } from "vitest";

import { defineBlock } from "../../src/blocks/index.js";
import { BlockRenderer } from "../../src/blocks/renderer/index.js";
import { entries } from "../../src/db/schema/entries.js";
import { block } from "../../src/events-and-filters/block-render.js";
import { definePlugin } from "../../src/plugin/define.js";
import { entry, fallback } from "../../src/route/render/template-builders.js";
import { defineTemplate } from "../../src/template.js";
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

/** Renders the entry's content tree, and nothing else. */
const blockTemplate = entry(({ data }) =>
  data.entry.contentBlocks ? (
    <BlockRenderer content={data.entry.contentBlocks} />
  ) : null,
);

const hooksSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            render: ({ data }) => {
              const id = useId();
              return (
                <article id={id} data-testid="hook-host">
                  {data.entry.title}
                </article>
              );
            },
          }),
        ),
      ],
    }),
  },
});

const ctxSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            render: ({ data, ctx }) => (
              <article data-testid="entry">
                <h1>{data.entry.title}</h1>
                <p data-testid="ctx-host">{new URL(ctx.request.url).host}</p>
              </article>
            ),
          }),
        ),
      ],
    }),
  },
});

describe("a factory-built template", () => {
  test("React hooks (useId) inside it render correctly", async () => {
    // Called outside React's render pass, hooks throw "Invalid hook call".
    const post = await hooksSite.factory.published.create({
      type: "post",
      slug: "handlers-ok",
      title: "Hooks Ok",
    });

    const page = await hooksSite.visit(post);

    // React 19's useId returns deterministic SSR ids; assert just the
    // presence of an id attribute, not its value.
    page
      .assertOk()
      .assertSee('data-testid="hook-host"')
      .assertSee('<article id="');
  });

  test("its render receives ctx with the request", async () => {
    const post = await ctxSite.factory.published.create({
      type: "post",
      slug: "ctx-aware",
      title: "Ctx Aware",
    });

    const page = await ctxSite.visit(post);

    page
      .assertSee('data-testid="ctx-host"')
      .assertSee("cms.example")
      .assertSee("Ctx Aware");
  });
});

const blockCountSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => (
          <span data-testid="blocks">
            {`blocks:${String(data.entry.contentBlocks?.blocks.length ?? 0)}`}
          </span>
        )),
      ],
    }),
  },
});

const nullBlocksSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => (
          <span data-testid="result">
            {`isNull:${String(data.entry.contentBlocks === null)}`}
          </span>
        )),
      ],
    }),
  },
});

describe("an entry's contentBlocks", () => {
  test("a theme reads them without a cast", async () => {
    const post = await blockCountSite.factory.published.create({
      type: "post",
      slug: "typed",
      title: "Typed",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "a", name: "core/heading", attrs: { text: "Hi" } },
          { id: "b", name: "core/paragraph", attrs: { text: "ok" } },
        ],
      },
    });

    const page = await blockCountSite.visit(post);

    page.assertSee("blocks:2");
  });

  test("are null when stored content doesn't match the EntryContent shape", async () => {
    const author = await nullBlocksSite.factory.admin.create();
    await nullBlocksSite.context.db.insert(entries).values({
      type: "post",
      slug: "bad",
      title: "Bad",
      content: { not: "valid" },
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    const page = await nullBlocksSite.visit("/post/bad");

    page.assertSee("isNull:true");
  });
});

const siteTitlePlugin = definePlugin("site-title", {
  setup: (ctx) => {
    ctx.registerShortcode({
      name: "site-title",
      render: ({ context }) => {
        const title = context.siteSettings.title;
        return typeof title === "string" ? title : "";
      },
    });
  },
});

const probePlugin = definePlugin("acme-probe", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "acme/probe",
        view: () =>
          Promise.resolve({
            default: ({ loaders }) => <div data-loaded>{loaders.marker}</div>,
            loaders: {
              marker: () => Promise.resolve("loaded-on-server"),
            },
          }),
      }),
    );
  },
});

const blocksSite = await testSite({
  plugins: [blogPlugin, siteTitlePlugin, probePlugin],
  config: {
    theme: defineTheme({ templates: [fallback(() => null), blockTemplate] }),
  },
});

describe("a template rendering <BlockRenderer/>", () => {
  test("renders the entry's content tree", async () => {
    const post = await blocksSite.factory.published.create({
      type: "post",
      slug: "with-blocks",
      title: "Blocks",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "h", name: "core/rich-text", attrs: { body: "<h2>Hi</h2>" } },
        ],
      },
    });

    const page = await blocksSite.visit(post);

    page.assertOk().assertSee("Hi");
  });

  test("a rich-text body shortcode reads the configured site settings", async () => {
    await blocksSite.factory.setting.create({
      group: "site",
      key: "title",
      value: "Acme",
    });
    const post = await blocksSite.factory.published.create({
      type: "post",
      slug: "welcome",
      title: "Welcome",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "b",
            name: "core/rich-text",
            attrs: { body: "<p>Welcome to [site-title]</p>" },
          },
        ],
      },
    });

    const page = await blocksSite.visit(post);

    page.assertSee("<p>Welcome to Acme</p>");
  });

  test("block loaders are pre-resolved before render, so render() sees the resolved data", async () => {
    const post = await blocksSite.factory.published.create({
      type: "post",
      slug: "with-loader",
      title: "Loader Block",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "n", name: "acme/probe", attrs: {} }],
      },
    });

    const page = await blocksSite.visit(post);

    page.assertOk().assertSee("loaded-on-server");
  });
});

const seen: string[] = [];
const decoratorPlugin = definePlugin("acme-decorator", {
  setup: (ctx) => {
    ctx.filters.add(block.beforeRender, (element, input) => {
      seen.push(`before:${input.node.name}`);
      return createElement("mark", { "data-testid": "before" }, element);
    });
    ctx.filters.add(block.afterRender, (element, input) => {
      seen.push(`after:${input.node.name}`);
      return element;
    });
  },
});

const decoratedSite = await testSite({
  plugins: [blogPlugin, decoratorPlugin],
  config: {
    theme: defineTheme({ templates: [fallback(() => null), blockTemplate] }),
  },
});

describe("a plugin subscribing to block.beforeRender and block.afterRender", () => {
  test("decorates a rendered block", async () => {
    const post = await decoratedSite.factory.published.create({
      type: "post",
      slug: "decorated",
      title: "Decorated",
      content: {
        version: "plumix.v2",
        blocks: [
          { id: "h", name: "core/rich-text", attrs: { body: "<h2>Hi</h2>" } },
        ],
      },
    });

    const page = await decoratedSite.visit(post);

    page.assertOk().assertSee('data-testid="before"');
    expect(seen).toEqual(["before:core/rich-text", "after:core/rich-text"]);
  });
});

const tokensSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      tokens: { colors: { brand: { value: "#abc" } } },
      templates: [fallback(() => null), blockTemplate],
    }),
  },
});

const tokensOnlySite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      allowCustomStyles: false,
      templates: [fallback(() => null), blockTemplate],
    }),
  },
});

describe("a styled block", () => {
  test("its stored `var(--plumix-…)` value is emitted verbatim", async () => {
    const post = await tokensSite.factory.published.create({
      type: "post",
      slug: "styled",
      title: "Styled",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "s",
            name: "core/rich-text",
            attrs: { body: "<h2>Hi</h2>" },
            style: { large: { background: "var(--plumix-color-brand, #abc)" } },
          },
        ],
      },
    });

    const page = await tokensSite.visit(post);

    page.assertSee("var(--plumix-color-brand, #abc)");
  });

  test("a stored literal a tokens-only theme forbids still renders", async () => {
    const post = await tokensOnlySite.factory.published.create({
      type: "post",
      slug: "legacy",
      title: "Legacy",
      content: {
        version: "plumix.v2",
        blocks: [
          {
            id: "s",
            name: "core/rich-text",
            attrs: { body: "<h2>Hi</h2>" },
            style: { large: { color: "#e11" } },
          },
        ],
      },
    });

    const page = await tokensOnlySite.visit(post);

    page.assertSee("color: #e11;");
  });
});

const greetingPlugin = definePlugin("acme-greeting", {
  setup: (ctx) => {
    ctx.registerBlock(
      defineBlock({
        name: "acme/greeting",
        view: () =>
          Promise.resolve({
            default: ({ context }) => (
              <p data-testid="greeting">
                {context.t({ id: "acme.greeting", message: "Hello" })}
              </p>
            ),
          }),
      }),
    );
  },
});

const germanSite = await testSite({
  plugins: [blogPlugin, greetingPlugin],
  config: {
    theme: defineTheme({ templates: [fallback(() => null), blockTemplate] }),
    i18n: { defaultLocale: "de", locales: ["de", "en"] },
  },
  build: {
    pluginCatalogs: {
      de: [() => Promise.resolve({ messages: { "acme.greeting": ["Hallo"] } })],
    },
  },
});

describe("a block's render", () => {
  test("resolves its strings from the request locale's catalogs", async () => {
    const post = await germanSite.factory.published.create({
      type: "post",
      slug: "greeting",
      title: "Greeting",
      content: {
        version: "plumix.v2",
        blocks: [{ id: "g", name: "acme/greeting", attrs: {} }],
      },
    });

    const page = await germanSite.visit(post);

    page.assertSee('<p data-testid="greeting">Hallo</p>');
  });
});
