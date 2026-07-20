import { describe, expect, test } from "vitest";

import type {
  ArchiveData,
  EntryData,
  ErrorData,
  FrontPageData,
  SearchData,
  TaxonomyData,
} from "./route/render/resolved-entry.js";
import type { ThemeDescriptor } from "./theme.js";
import { auth } from "./auth/config.js";
import { plumix } from "./config.js";
import { definePlugin } from "./plugin/define.js";
import { buildApp } from "./runtime/app.js";
import { ThemeRegistrationError } from "./theme-errors.js";
import {
  defineTheme,
  isArchive,
  isEntry,
  isError,
  isFrontPage,
  isSearch,
  isTaxonomy,
} from "./theme.js";

const stubAdapter = {
  name: "test",
  buildFetchHandler: () => () => new Response("stub"),
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) };
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});

// Bypass the compile-time `templates.index` requirement to simulate a
// hand-rolled descriptor that skipped the `defineTheme` factory.
const badTheme = { templates: {} } as unknown as ThemeDescriptor;

describe("defineTheme", () => {
  test("throws ThemeRegistrationError when templates.index is missing", () => {
    expect(() => defineTheme(badTheme)).toThrow(ThemeRegistrationError);
  });
});

describe("buildApp — theme:document filter", () => {
  test("app.document mirrors theme.document when no plugin filters are registered", async () => {
    const theme = defineTheme({
      templates: { index: () => null },
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

  test("multiple plugin filters compose in registration order", async () => {
    const firstPlugin = definePlugin("first", (ctx) => {
      ctx.addFilter("theme:document", (manifest) => ({
        ...manifest,
        meta: [
          ...(manifest.meta ?? []),
          { name: "viewport", content: "first" },
        ],
      }));
    });
    const secondPlugin = definePlugin("second", (ctx) => {
      ctx.addFilter("theme:document", (manifest) => ({
        ...manifest,
        meta: [
          ...(manifest.meta ?? []),
          { name: "viewport", content: "second" },
        ],
      }));
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({ templates: { index: () => null } }),
        plugins: [firstPlugin, secondPlugin],
      }),
    );
    expect(app.document.meta).toEqual([
      { name: "viewport", content: "first" },
      { name: "viewport", content: "second" },
    ]);
  });

  test("plugins receive {} when the theme has no `document`", async () => {
    let observedInput: unknown;
    const probePlugin = definePlugin("probe", (ctx) => {
      ctx.addFilter("theme:document", (manifest) => {
        observedInput = manifest;
        return manifest;
      });
    });
    await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({ templates: { index: () => null } }),
        plugins: [probePlugin],
      }),
    );
    expect(observedInput).toEqual({});
  });

  test("app.document is frozen — mutation throws in strict mode", async () => {
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: { index: () => null },
          document: { meta: [{ name: "viewport", content: "x" }] },
        }),
      }),
    );
    expect(Object.isFrozen(app.document)).toBe(true);
    expect(() => {
      (app.document as { meta?: unknown }).meta = "mutated";
    }).toThrow(TypeError);
  });

  test("validation throws when post-filter `link[]` entry is missing `rel`", async () => {
    const broken = definePlugin("broken-link", (ctx) => {
      ctx.addFilter("theme:document", (manifest) => ({
        ...manifest,
        link: [
          ...(manifest.link ?? []),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- exercise the post-filter validator with a JS-shaped contribution
          { href: "/orphan.css" } as any,
        ],
      }));
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: defineTheme({ templates: { index: () => null } }),
          plugins: [broken],
        }),
      ),
    ).rejects.toMatchObject({
      name: "ThemeRegistrationError",
      code: "document_invalid_link",
    });
  });

  test("validation throws when post-filter `script[]` has neither src nor inline content", async () => {
    const broken = definePlugin("broken-script", (ctx) => {
      ctx.addFilter("theme:document", (manifest) => ({
        ...manifest,
        script: [...(manifest.script ?? []), { type: "module" }],
      }));
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: defineTheme({ templates: { index: () => null } }),
          plugins: [broken],
        }),
      ),
    ).rejects.toMatchObject({
      name: "ThemeRegistrationError",
      code: "document_invalid_script",
    });
  });

  test("buildApp rejects when a theme:document filter throws", async () => {
    const explode = definePlugin("explode", (ctx) => {
      ctx.addFilter("theme:document", () => {
        throw new Error("filter blew up");
      });
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: defineTheme({ templates: { index: () => null } }),
          plugins: [explode],
        }),
      ),
    ).rejects.toThrow(/filter blew up/);
  });

  test("a single plugin filter merges into app.document", async () => {
    const seoPlugin = definePlugin("seo", (ctx) => {
      ctx.addFilter("theme:document", (manifest) => ({
        ...manifest,
        meta: [
          ...(manifest.meta ?? []),
          { property: "og:site_name", content: "Demo" },
        ],
      }));
    });
    const theme = defineTheme({
      templates: { index: () => null },
      document: { link: [{ rel: "icon", href: "/favicon.svg" }] },
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme,
        plugins: [seoPlugin],
      }),
    );
    expect(app.document.link).toEqual([{ rel: "icon", href: "/favicon.svg" }]);
    expect(app.document.meta).toEqual([
      { property: "og:site_name", content: "Demo" },
    ]);
  });
});

describe("buildApp — core site settings", () => {
  test("seeds the built-in `site` group and `general` page into the registry", async () => {
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({ templates: { index: () => null } }),
      }),
    );
    const group = app.plugins.settingsGroups.get("site");
    expect(group?.fields.map((f) => f.key)).toContain("title");
    expect(app.plugins.settingsPages.get("general")?.groups).toContain("site");
  });

  test("a plugin cannot re-register the core-reserved `site` group", async () => {
    const collide = definePlugin("collide", (ctx) => {
      ctx.registerSettingsGroup("site", {
        label: "Mine",
        fields: [{ key: "x", type: "string", inputType: "text", label: "X" }],
      });
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: defineTheme({ templates: { index: () => null } }),
          plugins: [collide],
        }),
      ),
    ).rejects.toThrow(/already registered/i);
  });
});

describe("buildApp — per-template document fragments", () => {
  test("PlumixApp.templateDocuments holds the per-template merged manifest", async () => {
    const { defineTemplate } = await import("./template.js");
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          render: () => null,
          document: { meta: [{ name: "robots", content: "noindex" }] },
        }),
      },
      document: {
        meta: [{ name: "theme-color", content: "#0ea5e9" }],
      },
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme,
      }),
    );
    const singleDoc = app.templateDocuments.get("single");
    expect(singleDoc?.meta).toEqual([
      { name: "theme-color", content: "#0ea5e9" },
      { name: "robots", content: "noindex" },
    ]);
  });

  test("templates without a document fragment do NOT populate the map", async () => {
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: { index: () => null, single: () => null },
          document: { meta: [{ name: "x", content: "y" }] },
        }),
      }),
    );
    expect(app.templateDocuments.has("single")).toBe(false);
    expect(app.templateDocuments.has("index")).toBe(false);
  });

  test("templateDocuments entries are deep-frozen", async () => {
    const { defineTemplate } = await import("./template.js");
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: defineTheme({
          templates: {
            index: () => null,
            single: defineTemplate({
              render: () => null,
              document: { link: [{ rel: "icon", href: "/x.svg" }] },
            }),
          },
        }),
      }),
    );
    const doc = app.templateDocuments.get("single");
    expect(Object.isFrozen(doc)).toBe(true);
    expect(() => {
      (doc as { link?: unknown }).link = "mutated";
    }).toThrow(TypeError);
  });
});

describe("template-data guards", () => {
  // The guards read only the `kind` discriminant, so minimal casts suffice.
  const entry = { kind: "entry" } as EntryData;
  const archive = { kind: "archive" } as ArchiveData;
  const taxonomy = { kind: "taxonomy" } as TaxonomyData;
  const frontPage = { kind: "frontPage" } as FrontPageData;
  const search = { kind: "search" } as SearchData;
  const error = { kind: "error" } as ErrorData;
  const all = [entry, archive, taxonomy, frontPage, search, error];

  test("each guard narrows exactly its own kind", () => {
    expect(all.filter(isEntry)).toEqual([entry]);
    expect(all.filter(isArchive)).toEqual([archive]);
    expect(all.filter(isTaxonomy)).toEqual([taxonomy]);
    expect(all.filter(isFrontPage)).toEqual([frontPage]);
    expect(all.filter(isSearch)).toEqual([search]);
    expect(all.filter(isError)).toEqual([error]);
  });
});

describe("buildApp", () => {
  test("throws ThemeRegistrationError when config.theme omits templates.index", async () => {
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: badTheme,
        }),
      ),
    ).rejects.toThrow(ThemeRegistrationError);
  });
});
