import { describe, expect, expectTypeOf, test } from "vitest";

import type { CoreBlockName } from "./blocks/core-blocks.js";
import type { StyleCategory } from "./blocks/index.js";
import type {
  ArchiveTypeData,
  EntryData,
  EntryTypeArchiveData,
  ErrorData,
  FrontPageData,
  SearchData,
  TermArchiveData,
} from "./route/contract/resolved-entry.js";
import type { ThemeDescriptor } from "./theme.js";
import { auth } from "./auth/config.js";
import { definePlugin } from "./plugin/define.js";
import { fallback } from "./route/render/template-builders.js";
import { buildApp } from "./runtime/app.js";
import { plumix } from "./runtime/define-config.js";
import { createDispatcherHarness, plumixRequest } from "./test/dispatcher.js";
import {
  defineTheme,
  isArchiveType,
  isEntry,
  isEntryType,
  isError,
  isFrontPage,
  isSearch,
  isTerm,
} from "./theme.js";

const stubAdapter = {
  name: "test",
  handler: {},
  generateEntry: () => "",
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) };
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});

// Stands in for a field a plugin contributes from outside core — the OG
// plugin's `ogCards` is the real case.
declare module "./theme.js" {
  interface ThemeDescriptor {
    readonly testCards?: readonly string[];
  }
}

describe("buildApp — registerDocumentManifest", () => {
  test("app.document mirrors theme.document when no plugin registers a manifest", async () => {
    const theme = defineTheme({
      templates: [fallback(() => null)],
      document: { link: [{ rel: "icon", href: "/favicon.svg" }] },
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme,
      }),
    );
    expect(app.document).toEqual({
      link: [{ rel: "icon", href: "/favicon.svg" }],
    });
  });

  test("two plugins' manifests merge after the theme's in config order", async () => {
    const firstPlugin = definePlugin("first", {
      setup: (ctx) => {
        ctx.registerDocumentManifest({
          meta: [{ name: "viewport", content: "first" }],
          titleTemplate: "%s | first",
        });
      },
    });
    const secondPlugin = definePlugin("second", {
      setup: (ctx) => {
        ctx.registerDocumentManifest({
          meta: [{ name: "viewport", content: "second" }],
          titleTemplate: "%s | second",
        });
      },
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: [fallback(() => null)],
          document: { meta: [{ name: "theme-color", content: "#fff" }] },
        }),
        plugins: [secondPlugin, firstPlugin],
      }),
    );
    expect(app.document.meta).toEqual([
      { name: "theme-color", content: "#fff" },
      { name: "viewport", content: "second" },
      { name: "viewport", content: "first" },
    ]);
    expect(app.document.titleTemplate).toBe("%s | first");
  });

  test("a plugin's manifest applies when the theme has no `document`", async () => {
    const plugin = definePlugin("scripts", {
      setup: (ctx) => {
        ctx.registerDocumentManifest({
          script: [{ src: "https://cdn.example/a.js" }],
        });
      },
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({ templates: [fallback(() => null)] }),
        plugins: [plugin],
      }),
    );
    expect(app.document.script).toEqual([{ src: "https://cdn.example/a.js" }]);
  });

  test("the merged app.document is deep-frozen", async () => {
    const plugin = definePlugin("meta", {
      setup: (ctx) => {
        ctx.registerDocumentManifest({
          meta: [{ name: "robots", content: "index" }],
          html: { lang: "en" },
        });
      },
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: [fallback(() => null)],
          document: { meta: [{ name: "viewport", content: "x" }] },
        }),
        plugins: [plugin],
      }),
    );
    expect(Object.isFrozen(app.document)).toBe(true);
    expect(Object.isFrozen(app.document.meta)).toBe(true);
    expect(Object.isFrozen(app.document.meta?.[1])).toBe(true);
    expect(Object.isFrozen(app.document.html)).toBe(true);
    expect(() => {
      (app.document as { meta?: unknown }).meta = "mutated";
    }).toThrow(TypeError);
  });

  test("a registered `link[]` entry missing `rel` fails boot", async () => {
    const broken = definePlugin("broken-link", {
      setup: (ctx) => {
        ctx.registerDocumentManifest({ link: [{ href: "/orphan.css" }] });
      },
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: defineTheme({ templates: [fallback(() => null)] }),
          plugins: [broken],
        }),
      ),
    ).rejects.toMatchObject({
      name: "ThemeRegistrationError",
      code: "document_invalid_link",
    });
  });

  test("a registered `script[]` entry with neither src nor inline content fails boot", async () => {
    const broken = definePlugin("broken-script", {
      setup: (ctx) => {
        ctx.registerDocumentManifest({ script: [{ type: "module" }] });
      },
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: defineTheme({ templates: [fallback(() => null)] }),
          plugins: [broken],
        }),
      ),
    ).rejects.toMatchObject({
      name: "ThemeRegistrationError",
      code: "document_invalid_script",
    });
  });
});

describe("buildApp — core site settings", () => {
  test("seeds the built-in `site` group and `general` page into the registry", async () => {
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({ templates: [fallback(() => null)] }),
      }),
    );
    const group = app.plugins.settingsGroups.get("site");
    expect(group?.fields.map((f) => f.key)).toContain("title");
    expect(app.plugins.settingsPages.get("general")?.groups).toContain("site");
  });

  test("a plugin cannot re-register the core-reserved `site` group", async () => {
    const collide = definePlugin("collide", {
      setup: (ctx) => {
        ctx.registerSettingsGroup("site", {
          label: "Mine",
          fields: [{ key: "x", type: "string", inputType: "text", label: "X" }],
        });
      },
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: defineTheme({ templates: [fallback(() => null)] }),
          plugins: [collide],
        }),
      ),
    ).rejects.toThrow(/already registered/i);
  });
});

describe("buildApp — ctx.theme", () => {
  test("hands the theme's own descriptor to setup and afterSetup", async () => {
    const seen: (readonly string[] | undefined)[] = [];
    const reader = definePlugin("reader", {
      setup: (ctx) => {
        seen.push(ctx.theme.testCards);
      },
      afterSetup: (ctx) => {
        seen.push(ctx.theme.testCards);
      },
    });

    await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: [fallback(() => null)],
          testCards: ["home", "post"],
        }),
        plugins: [reader],
      }),
    );

    expect(seen).toEqual([
      ["home", "post"],
      ["home", "post"],
    ]);
  });

  // A shortcode and a document manifest are read by different registries, so
  // the two assertions cover both.
  test("registrations made from the theme reach every registry", async () => {
    const contributor = definePlugin("contributor", {
      setup: (ctx) => {
        for (const card of ctx.theme.testCards ?? []) {
          ctx.registerShortcode({ name: card, render: () => card });
          ctx.registerDocumentManifest({
            meta: [{ name: "card", content: card }],
          });
        }
      },
    });

    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: [fallback(() => null)],
          testCards: ["home"],
        }),
        plugins: [contributor],
      }),
    );

    expect(app.shortcodes.get("home")).toBeDefined();
    expect(app.document.meta).toEqual([{ name: "card", content: "home" }]);
  });
});

describe("ctx.theme — theme-declared data reaching a request", () => {
  const cardsPlugin = () =>
    definePlugin("cards", {
      setup: (ctx) => {
        const declared = ctx.theme.testCards ?? [];
        ctx.registerRoute({
          method: "GET",
          path: "/list",
          auth: "public",
          handler: () => new Response(declared.join(",")),
        });
      },
    });

  test("a route serves the field the theme declared", async () => {
    const h = await createDispatcherHarness({
      config: {
        plugins: [cardsPlugin()],
        theme: defineTheme({
          templates: [fallback(() => null)],
          testCards: ["home", "post"],
        }),
      },
    });

    const response = await h.dispatch(
      plumixRequest("/_plumix/cards/list", { method: "GET" }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("home,post");
  });
});

describe("template-data guards", () => {
  // The guards read only the `kind` discriminant, so minimal casts suffice.
  const entry = { kind: "entry" } as EntryData;
  const entryType = { kind: "entryType" } as EntryTypeArchiveData;
  const term = { kind: "term" } as TermArchiveData;
  const archiveType = { kind: "archiveType" } as ArchiveTypeData;
  const frontPage = { kind: "frontPage" } as FrontPageData;
  const search = { kind: "search" } as SearchData;
  const error = { kind: "error" } as ErrorData;
  const all = [entry, entryType, term, archiveType, frontPage, search, error];

  test("each guard narrows exactly its own kind", () => {
    expect(all.filter(isEntry)).toEqual([entry]);
    expect(all.filter(isEntryType)).toEqual([entryType]);
    expect(all.filter(isTerm)).toEqual([term]);
    expect(all.filter(isArchiveType)).toEqual([archiveType]);
    expect(all.filter(isFrontPage)).toEqual([frontPage]);
    expect(all.filter(isSearch)).toEqual([search]);
    expect(all.filter(isError)).toEqual([error]);
  });
});

describe("defineTheme — allowedBlocks", () => {
  test("takes the core block names and any other block name", () => {
    const theme = defineTheme({
      templates: [fallback(() => null)],
      allowedBlocks: ["core/rich-text", "core/columns", "forms/form"],
    });

    expect(theme.allowedBlocks).toEqual([
      "core/rich-text",
      "core/columns",
      "forms/form",
    ]);
    // `string & {}` keeps the core names offered while any string is accepted.
    expectTypeOf<
      NonNullable<ThemeDescriptor["allowedBlocks"]>[number]
    >().toEqualTypeOf<CoreBlockName | (string & {})>();
  });

  test("buildApp resolves the list once, for every request's content check", async () => {
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: [fallback(() => null)],
          allowedBlocks: ["core/columns"],
        }),
      }),
    );

    expect([...app.allowedBlocks].sort()).toEqual([
      "core/column",
      "core/columns",
    ]);
  });
});

describe("defineTheme — allowCustomStyles", () => {
  test("takes a boolean or the categories that keep custom values", () => {
    const tokensOnly = defineTheme({
      templates: [fallback(() => null)],
      allowCustomStyles: false,
    });
    const sizesFree = defineTheme({
      templates: [fallback(() => null)],
      allowCustomStyles: ["width", "height"],
    });

    expect(tokensOnly.allowCustomStyles).toBe(false);
    expect(sizesFree.allowCustomStyles).toEqual(["width", "height"]);
    expectTypeOf<ThemeDescriptor["allowCustomStyles"]>().toEqualTypeOf<
      boolean | readonly StyleCategory[] | undefined
    >();
  });
  test("refuses a category no style property has", () => {
    defineTheme({
      templates: [fallback(() => null)],
      // @ts-expect-error a misspelled category is not a StyleCategory
      allowCustomStyles: ["colour"],
    });

    expectTypeOf<"colour">().not.toExtend<StyleCategory>();
  });
});
