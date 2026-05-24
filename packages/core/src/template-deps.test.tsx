import { describe, expect, test } from "vitest";

import { auth } from "./auth/config.js";
import { plumix } from "./config.js";
import { definePlugin } from "./plugin/define.js";
import { DuplicateRegistrationError } from "./plugin/errors.js";
import { buildApp } from "./runtime/app.js";
import { defineTemplate, normalizeTemplate } from "./template.js";
import { loadTemplateDeps } from "./template-deps.js";
import type { RegisteredTemplateDep } from "./template-deps.js";
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
        load: async (slugs) =>
          Object.fromEntries(slugs.map((s) => [s, { value: s }])),
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
      ctx.registerTemplateDep("test-thing", { load: async () => ({}) });
    });
    const second = definePlugin("second", (ctx) => {
      ctx.registerTemplateDep("test-thing", { load: async () => ({}) });
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
        load: async () => ({ x: { value: "from-a" } }),
      });
    });
    const b = definePlugin("b", (ctx) => {
      ctx.registerTemplateDep("test-other", { load: async () => ({ y: 42 }) });
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
  const errors: Array<{ msg: string; ctx?: Record<string, unknown> }> = [];
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
      load: async (slugs, _ctx) => load(slugs),
    });
  }
  return out;
}

describe("loadTemplateDeps", () => {
  test("invokes every declared kind in parallel via Promise.all", async () => {
    // Two loaders each sleep 30ms — serial would take 60ms, parallel
    // ~30ms. Window with 5ms slack for CI noise.
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const registry = makeRegistry({
      "test-thing": async () => {
        await sleep(30);
        return { a: { value: "thing-a" } };
      },
      "test-other": async () => {
        await sleep(30);
        return { b: 7 };
      },
    });
    const template = { "test-thing": ["a"], "test-other": ["b"] };
    const ctx = captureLogger();
    const start = Date.now();
    const deps = await loadTemplateDeps(
      template,
      registry,
      { logger: ctx.logger } as unknown as Parameters<typeof loadTemplateDeps>[2],
    );
    const elapsed = Date.now() - start;
    expect(deps["test-thing"]).toEqual({ a: { value: "thing-a" } });
    expect(deps["test-other"]).toEqual({ b: 7 });
    expect(elapsed).toBeLessThan(55);
  });

  test("a slug missing from the loader result fills with null", async () => {
    const registry = makeRegistry({
      "test-thing": async () => ({ present: { value: "yes" } }),
    });
    const template = { "test-thing": ["present", "absent"] };
    const ctx = captureLogger();
    const deps = await loadTemplateDeps(
      template,
      registry,
      { logger: ctx.logger } as unknown as Parameters<typeof loadTemplateDeps>[2],
    );
    expect(deps["test-thing"]).toEqual({
      present: { value: "yes" },
      absent: null,
    });
  });

  test("a thrown loader logs `template_dep_load_failed` and seeds an empty map", async () => {
    const registry = makeRegistry({
      "test-thing": async () => {
        throw new Error("db down");
      },
    });
    const template = { "test-thing": ["x"] };
    const ctx = captureLogger();
    const deps = await loadTemplateDeps(
      template,
      registry,
      { logger: ctx.logger } as unknown as Parameters<typeof loadTemplateDeps>[2],
    );
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
        load: async (slugs) =>
          Object.fromEntries(slugs.map((s) => [s, { value: `loaded-${s}` }])),
      });
    });
    const theme = defineTheme({
      templates: {
        index: () => null,
        single: defineTemplate({
          "test-thing": ["alpha", "beta"],
          render: (args) => {
            const deps = (args as unknown as Record<string, Record<string, { value: string } | null>>)["test-thing"];
            return (
              <article>
                <span data-testid="alpha">{deps?.alpha?.value ?? "missing"}</span>
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
        load: async () => {
          throw new Error("loader exploded");
        },
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
            const all = (
              args as unknown as Record<
                string,
                Record<string, Record<string, unknown> | null> | undefined
              >
            ).settings;
            const siteInfo = all?.["site-info"];
            const title =
              siteInfo && typeof siteInfo === "object"
                ? (siteInfo as Record<string, unknown>).title
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

describe("loadTemplateDeps — legacy templates", () => {
  test("a normalized legacy function template has no declarations; returns {}", async () => {
    const legacy = normalizeTemplate(() => null, "single");
    const registry = makeRegistry({
      "test-thing": async () => ({ x: { value: "should-not-load" } }),
    });
    const ctx = captureLogger();
    const deps = await loadTemplateDeps(
      legacy as unknown as Record<string, unknown>,
      registry,
      { logger: ctx.logger } as unknown as Parameters<typeof loadTemplateDeps>[2],
    );
    expect(deps).toEqual({});
    expect(ctx.errors).toEqual([]);
  });
});
