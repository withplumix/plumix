import { describe, expect, test } from "vitest";

import type { ThemeDescriptor } from "./theme.js";
import { auth } from "./auth/config.js";
import { plumix } from "./config.js";
import { definePlugin } from "./plugin/define.js";
import { buildApp } from "./runtime/app.js";
import { ThemeRegistrationError } from "./theme-errors.js";
import { defineTheme } from "./theme.js";

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

  test("throws ThemeRegistrationError when config has no theme", async () => {
    await expect(
      buildApp(
        // @ts-expect-error -- exercising the JS-caller runtime guard
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
        }),
      ),
    ).rejects.toThrow(ThemeRegistrationError);
  });
});
