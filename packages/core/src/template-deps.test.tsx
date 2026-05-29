import { describe, expect, test } from "vitest";

import type { RegisteredTemplateDep } from "./template-deps.js";
import { auth } from "./auth/config.js";
import { plumix } from "./config.js";
import { settings as settingsSchema } from "./db/schema/settings.js";
import { definePlugin } from "./plugin/define.js";
import { DuplicateRegistrationError } from "./plugin/errors.js";
import { buildApp } from "./runtime/app.js";
import { loadTemplateDeps } from "./template-deps.js";
import { defineTemplate, normalizeTemplate } from "./template.js";
import { createDispatcherHarness } from "./test/dispatcher.js";
import { defineTheme } from "./theme.js";

const stubAdapter = {
  name: "test",
  buildFetchHandler: () => () => new Response("stub"),
};
const stubDatabase = { kind: "test", connect: () => ({ db: {} }) };
const stubAuth = auth({
  passkey: { rpName: "t", rpId: "t", origin: "https://t" },
});
const stubTheme = defineTheme({ templates: { index: () => null } });

// Augment the registry with a test-only kind so the typed
// `registerTemplateDep("test-thing", ...)` calls below compile.
declare module "./template.js" {
  interface TemplateDepRegistry {
    "test-thing": { slug: string; result: { value: string } };
    "test-other": { slug: string; result: number };
  }
}

describe("ctx.registerTemplateDep", () => {
  test("a plugin's registration lands in app.plugins.templateDeps", async () => {
    const probe = definePlugin("probe", (ctx) => {
      ctx.registerTemplateDep("test-thing", {
        load: (slugs) =>
          Promise.resolve(
            Object.fromEntries(slugs.map((s) => [s, { value: s }])),
          ),
      });
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: stubTheme,
        plugins: [probe],
      }),
    );
    const dep = app.plugins.templateDeps.get("test-thing");
    expect(dep?.registeredBy).toBe("probe");
    expect(typeof dep?.load).toBe("function");
  });

  test("two plugins registering the same kind throw at boot", async () => {
    const first = definePlugin("first", (ctx) => {
      ctx.registerTemplateDep("test-thing", {
        load: () => Promise.resolve({}),
      });
    });
    const second = definePlugin("second", (ctx) => {
      ctx.registerTemplateDep("test-thing", {
        load: () => Promise.resolve({}),
      });
    });
    await expect(
      buildApp(
        plumix({
          runtime: stubAdapter,
          database: stubDatabase,
          auth: stubAuth,
          theme: stubTheme,
          plugins: [first, second],
        }),
      ),
    ).rejects.toThrow(DuplicateRegistrationError);
  });

  test("different kinds from different plugins coexist", async () => {
    const a = definePlugin("a", (ctx) => {
      ctx.registerTemplateDep("test-thing", {
        load: () => Promise.resolve({ x: { value: "from-a" } }),
      });
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerTemplateDep("test-other", {
        load: () => Promise.resolve({ y: 42 }),
      });
    });
    const app = await buildApp(
      plumix({
        runtime: stubAdapter,
        database: stubDatabase,
        auth: stubAuth,
        theme: stubTheme,
        plugins: [a, b],
      }),
    );
    expect(app.plugins.templateDeps.get("test-thing")?.registeredBy).toBe("a");
    expect(app.plugins.templateDeps.get("test-other")?.registeredBy).toBe("b");
  });
});

const captureLogger = () => {
  const errors: { msg: string; ctx?: Record<string, unknown> }[] = [];
  return {
    errors,
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
      error: (msg: string, ctx?: Record<string, unknown>) => {
        errors.push({ msg, ctx });
      },
    },
  };
};

function makeRegistry(
  entries: Record<
    string,
    (slugs: readonly string[]) => Promise<Record<string, unknown>>
  >,
): ReadonlyMap<string, RegisteredTemplateDep> {
  const out = new Map<string, RegisteredTemplateDep>();
  for (const [kind, load] of Object.entries(entries)) {
    out.set(kind, {
      kind,
      registeredBy: "test",
      load: (slugs, _ctx) => load(slugs),
    });
  }
  return out;
}

describe("loadTemplateDeps", () => {
  test("invokes every declared kind in parallel via Promise.all", async () => {
    // Two loaders each sleep 50ms — serial would take 100ms, parallel
    // ~50ms. The threshold sits below the serial floor so a regression
    // to sequential `await`s fails the test, but stays far enough
    // above the parallel floor to absorb CI scheduler jitter (saw 61ms
    // for 30ms+5ms-slack tuning).
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const registry = makeRegistry({
      "test-thing": async () => {
        await sleep(50);
        return { a: { value: "thing-a" } };
      },
      "test-other": async () => {
        await sleep(50);
        return { b: 7 };
      },
    });
    const template = { "test-thing": ["a"], "test-other": ["b"] };
    const ctx = captureLogger();
    const start = Date.now();
    const deps = await loadTemplateDeps(template, registry, {
      logger: ctx.logger,
    } as unknown as Parameters<typeof loadTemplateDeps>[2]);
    const elapsed = Date.now() - start;
    expect(deps["test-thing"]).toEqual({ a: { value: "thing-a" } });
    expect(deps["test-other"]).toEqual({ b: 7 });
    expect(elapsed).toBeLessThan(90);
  });

  test("a slug missing from the loader result fills with null", async () => {
    const registry = makeRegistry({
      "test-thing": () => Promise.resolve({ present: { value: "yes" } }),
    });
    const template = { "test-thing": ["present", "absent"] };
    const ctx = captureLogger();
    const deps = await loadTemplateDeps(template, registry, {
      logger: ctx.logger,
    } as unknown as Parameters<typeof loadTemplateDeps>[2]);
    expect(deps["test-thing"]).toEqual({
      present: { value: "yes" },
      absent: null,
    });
  });

  test("a thrown loader logs `template_dep_load_failed` and seeds an empty map", async () => {
    const registry = makeRegistry({
      "test-thing": () => Promise.reject(new Error("db down")),
    });
    const template = { "test-thing": ["x"] };
    const ctx = captureLogger();
    const deps = await loadTemplateDeps(template, registry, {
      logger: ctx.logger,
    } as unknown as Parameters<typeof loadTemplateDeps>[2]);
    expect(deps["test-thing"]).toEqual({});
    expect(ctx.errors[0]?.msg).toBe("template_dep_load_failed");
    expect(ctx.errors[0]?.ctx).toMatchObject({
      kind: "test-thing",
      slugs: ["x"],
      err: "db down",
    });
  });
});

describe("renderThroughTheme — template deps lifecycle", () => {
  test("a template declaring deps receives the loader's results in render", async () => {
    const seoPlugin = definePlugin("seo", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
      ctx.registerTemplateDep("test-thing", {
        load: (slugs) =>
          Promise.resolve(
            Object.fromEntries(slugs.map((s) => [s, { value: `loaded-${s}` }])),
          ),
      });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          "test-thing": ["alpha", "beta"],
          render: (args) => {
            const deps = (
              args as unknown as Record<
                string,
                Record<string, { value: string } | null>
              >
            )["test-thing"];
            return (
              <article>
                <span data-testid="alpha">
                  {deps?.alpha?.value ?? "missing"}
                </span>
                <span data-testid="beta">{deps?.beta?.value ?? "missing"}</span>
              </article>
            );
          },
        }),
      },
    });
    const h = await createDispatcherHarness({ plugins: [seoPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "deps-flow",
      title: "Deps Flow",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const response = await h.dispatch(
      new Request("https://cms.example/post/deps-flow"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain("loaded-alpha");
    expect(body).toContain("loaded-beta");
  });

  test("a loader throw does not 500 the response", async () => {
    const broken = definePlugin("broken", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
      ctx.registerTemplateDep("test-thing", {
        load: () => Promise.reject(new Error("loader exploded")),
      });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          "test-thing": ["anything"],
          render: () => <p data-testid="rendered">ok</p>,
        }),
      },
    });
    const h = await createDispatcherHarness({ plugins: [broken], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "broken-dep",
      title: "Broken Dep",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    const response = await h.dispatch(
      new Request("https://cms.example/post/broken-dep"),
    );
    expect(response.status).toBe(200);
    const body = await response.text();
    expect(body).toContain('data-testid="rendered"');
  });
});

describe("core settings dep", () => {
  test("settings table rows flow into a template declaring `settings: [...groups]`", async () => {
    const blogPlugin = definePlugin("blog", (ctx) => {
      ctx.registerEntryType("post", {
        label: "Posts",
        isPublic: true,
        hasArchive: true,
      });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          settings: ["site-info"],
          render: (args) => {
            const siteInfo = args.settings?.["site-info"];
            const title =
              siteInfo && typeof siteInfo === "object"
                ? siteInfo.title
                : undefined;
            return (
              <h1 data-testid="site-title">
                {typeof title === "string" ? title : "Untitled"}
              </h1>
            );
          },
        }),
      },
    });
    const h = await createDispatcherHarness({ plugins: [blogPlugin], theme });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "settings-flow",
      title: "Settings Flow",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });

    // Without a settings row, the template renders the fallback.
    const before = await h.dispatch(
      new Request("https://cms.example/post/settings-flow"),
    );
    expect(await before.text()).toContain("Untitled");

    const { settings } = await import("./db/schema/settings.js");
    await h.db.insert(settings).values({
      group: "site-info",
      key: "title",
      value: "Plumix Demo",
    });

    const after = await h.dispatch(
      new Request("https://cms.example/post/settings-flow"),
    );
    expect(await after.text()).toContain("Plumix Demo");
  });
});

function pickString(bag: unknown, key: string): string {
  if (bag === null || typeof bag !== "object") return "";
  const value = (bag as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

const blogTypePlugin = definePlugin("blog", (ctx) => {
  ctx.registerEntryType("post", {
    label: "Posts",
    isPublic: true,
    hasArchive: true,
  });
});

describe("theme-level templateDeps", () => {
  test("declarations on `defineTheme` reach every template's render args", async () => {
    const theme = defineTheme({
      templateDeps: { settings: ["site-info"] },
      templates: {
        index: () => null,
        single: defineTemplate({
          render: (args) =>
            pickString(args.settings?.["site-info"], "title") || "Untitled",
        }),
      },
    });
    const h = await createDispatcherHarness({
      plugins: [blogTypePlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "from-theme",
      title: "From Theme",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.db.insert(settingsSchema).values({
      group: "site-info",
      key: "title",
      value: "Plumix Demo",
    });

    const response = await h.dispatch(
      new Request("https://cms.example/post/from-theme"),
    );
    expect(await response.text()).toContain("Plumix Demo");
  });

  test("per-template slugs union with theme-level slugs of the same kind", async () => {
    const theme = defineTheme({
      templateDeps: { settings: ["site-info"] },
      templates: {
        index: () => null,
        single: defineTemplate({
          settings: ["author-info"],
          render: (args) => (
            <article>
              {pickString(args.settings?.["site-info"], "title")}
              {"|"}
              {pickString(args.settings?.["author-info"], "name")}
            </article>
          ),
        }),
      },
    });
    const h = await createDispatcherHarness({
      plugins: [blogTypePlugin],
      theme,
    });
    const author = await h.seedUser("admin");
    await h.factory.entry.create({
      type: "post",
      slug: "union",
      title: "Union",
      content: null,
      status: "published",
      authorId: author.id,
      publishedAt: new Date(),
    });
    await h.db
      .insert(settingsSchema)
      .values([
        { group: "site-info", key: "title", value: "Plumix" },
        { group: "author-info", key: "name", value: "Ada" },
      ]);

    const response = await h.dispatch(
      new Request("https://cms.example/post/union"),
    );
    const body = await response.text();
    expect(body).toContain("Plumix");
    expect(body).toContain("Ada");
  });
});

describe("loadTemplateDeps — legacy templates", () => {
  test("a normalized legacy function template has no declarations; returns {}", async () => {
    const legacy = normalizeTemplate(() => null, "single");
    const registry = makeRegistry({
      "test-thing": () => Promise.resolve({ x: { value: "should-not-load" } }),
    });
    const ctx = captureLogger();
    const deps = await loadTemplateDeps(
      legacy as unknown as Record<string, unknown>,
      registry,
      { logger: ctx.logger } as unknown as Parameters<
        typeof loadTemplateDeps
      >[2],
    );
    expect(deps).toEqual({});
    expect(ctx.errors).toEqual([]);
  });
});
