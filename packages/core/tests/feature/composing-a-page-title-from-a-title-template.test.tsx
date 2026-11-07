import { describe, test } from "vitest";

import type { ResolvedEntry } from "../../src/route/contract/resolved-entry.js";
import { definePlugin } from "../../src/plugin/define.js";
import {
  entry,
  entryType,
  fallback,
} from "../../src/route/render/template-builders.js";
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

/** An archive template that names no title of its own. */
const untitledArchive = entryType(
  defineTemplate({
    render: ({ data }) => (
      <ul>
        {data.entries.map((entry: ResolvedEntry) => (
          <li key={entry.id}>{entry.title}</li>
        ))}
      </ul>
    ),
  }),
);

/** A single template whose document names the entry's title. */
const titledSingle = entry(
  defineTemplate({
    document: ({ data }) => ({ title: data.entry.title }),
    render: ({ data }) => <article>{data.entry.title}</article>,
  }),
);

const stringTemplateSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null), titledSingle],
      document: { titleTemplate: "%s · Plumix Starter" },
    }),
  },
});

const functionTemplateSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null), titledSingle],
      document: {
        titleTemplate: (title) => (title ? `${title} | Plumix` : "Plumix"),
      },
    }),
  },
});

const functionTemplateArchiveSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null), untitledArchive],
      document: {
        titleTemplate: (title) => title ?? "Plumix Archive",
      },
    }),
  },
});

const stringTemplateArchiveSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [fallback(() => null), untitledArchive],
      document: { titleTemplate: "%s · Plumix" },
    }),
  },
});

const noTitleTemplateSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(({ data }) => <article>{data.entry.title}</article>),
      ],
    }),
  },
});

const perTemplateSite = await testSite({
  plugins: [blogPlugin],
  config: {
    theme: defineTheme({
      templates: [
        fallback(() => null),
        entry(
          defineTemplate({
            document: ({ data }) => ({
              title: data.entry.title,
              titleTemplate: "%s | Per-Template",
            }),
            render: ({ data }) => <article>{data.entry.title}</article>,
          }),
        ),
      ],
      document: { titleTemplate: "%s · Theme" },
    }),
  },
});

describe("a page's <title>", () => {
  test("theme-level string titleTemplate composes the per-template title", async () => {
    const post = await stringTemplateSite.factory.published.create({
      type: "post",
      slug: "title-tmpl-string",
      title: "Hello world",
    });

    const page = await stringTemplateSite.visit(post);

    page.assertSee("<title>Hello world · Plumix Starter</title>");
  });

  test("function titleTemplate receives the per-template title", async () => {
    const post = await functionTemplateSite.factory.published.create({
      type: "post",
      slug: "title-tmpl-fn",
      title: "Hello",
    });

    const page = await functionTemplateSite.visit(post);

    page.assertSee("<title>Hello | Plumix</title>");
  });

  test("function titleTemplate receives undefined when template supplies no title", async () => {
    await functionTemplateArchiveSite.factory.published.create({
      type: "post",
      slug: "x",
      title: "X",
    });

    const page = await functionTemplateArchiveSite.visit("/post");

    page.assertSee("<title>Plumix Archive</title>");
  });

  test("string titleTemplate with no template title falls back to the resolver title", async () => {
    // Avoid unhead's "%s · Site" → " · Site" orphan-separator: when the
    // template doesn't name its own title and the theme uses string form,
    // the resolver-computed title still renders bare.
    await stringTemplateArchiveSite.factory.published.create({
      type: "post",
      slug: "x",
      title: "X",
    });

    const page = await stringTemplateArchiveSite.visit("/post");

    // Resolver-computed archive title is "Posts" (label/plural); string
    // template skips substitution and the bare resolver title renders.
    page.assertSee("<title>Posts</title>").assertDontSee(" · Plumix");
  });

  test("back-compat: theme without titleTemplate or document.title renders resolver title", async () => {
    const post = await noTitleTemplateSite.factory.published.create({
      type: "post",
      slug: "backcompat",
      title: "Resolver Title",
    });

    const page = await noTitleTemplateSite.visit(post);

    page.assertSee("<title>Resolver Title</title>");
  });

  test("per-template titleTemplate overrides the theme-level titleTemplate", async () => {
    const post = await perTemplateSite.factory.published.create({
      type: "post",
      slug: "override",
      title: "Override",
    });

    const page = await perTemplateSite.visit(post);

    page
      .assertSee("<title>Override | Per-Template</title>")
      .assertDontSee("Theme");
  });
});
