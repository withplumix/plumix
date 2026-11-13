import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { BlockViewModule } from "./block-registry.js";
import { createBlockRegistry, defineBlock } from "./block-registry.js";
import {
  blockViewModule,
  BlockViewNotLoadedError,
  loadBlockViews,
  loadedBlocksWithLoaders,
} from "./block-views.js";
import { collectBlockDepKeys } from "./deps.js";
import { resolveBlockLoaders } from "./loaders.js";
import { renderBlockTree } from "./render-block-tree.js";

function countingBlock(name: string): {
  readonly spec: ReturnType<typeof defineBlock>;
  readonly imports: () => number;
} {
  let count = 0;
  const module: BlockViewModule = { default: () => name };
  const spec = defineBlock({
    name,
    view: () => {
      count += 1;
      return Promise.resolve(module);
    },
  });
  return { spec, imports: () => count };
}

describe("loadBlockViews", () => {
  test("imports a block's view module once under concurrent calls", async () => {
    const hero = countingBlock("site/hero");
    const registry = createBlockRegistry([hero.spec]);

    await Promise.all([
      loadBlockViews(registry),
      loadBlockViews(registry),
      loadBlockViews(registry, ["site/hero"]),
    ]);

    expect(hero.imports()).toBe(1);
  });

  test("imports only the named blocks' view modules", async () => {
    const hero = countingBlock("site/hero");
    const card = countingBlock("site/card");
    const registry = createBlockRegistry([hero.spec, card.spec]);

    await loadBlockViews(registry, ["site/card"]);

    expect([hero.imports(), card.imports()]).toEqual([0, 1]);
  });

  test("skips a name the registry doesn't hold", async () => {
    const registry = createBlockRegistry([]);

    await expect(
      loadBlockViews(registry, ["site/missing"]),
    ).resolves.toBeUndefined();
  });
});

describe("blockViewModule", () => {
  test("returns the loaded view module", async () => {
    const view = (): string => "hero";
    const spec = defineBlock({
      name: "site/hero",
      view: () => Promise.resolve({ default: view }),
    });
    await loadBlockViews(createBlockRegistry([spec]));

    expect(blockViewModule(spec).default).toBe(view);
  });

  test("throws naming the block when its view module isn't loaded", () => {
    const spec = defineBlock({
      name: "site/hero",
      view: () => Promise.resolve({ default: () => "hero" }),
    });

    expect(() => blockViewModule(spec)).toThrow(BlockViewNotLoadedError);
    expect(() => blockViewModule(spec)).toThrow(
      'The view of block "site/hero" isn\'t loaded. Call loadBlockViews(registry) before rendering it.',
    );
  });
});

describe("reading a block's view module", () => {
  test("the walker renders the loaded view with the block's name", async () => {
    const spec = defineBlock({
      name: "site/hero",
      view: () =>
        Promise.resolve({
          default: ({ name }: { name: string }) => `view of ${name}`,
        }),
    });
    const registry = createBlockRegistry([spec]);
    await loadBlockViews(registry);

    const html = renderToStaticMarkup(
      renderBlockTree([{ id: "a", name: "site/hero" }], registry),
    );

    expect(html).toBe("<div>view of site/hero</div>");
  });

  test("the walker throws naming a block whose view isn't loaded", () => {
    const registry = createBlockRegistry([
      defineBlock({
        name: "site/hero",
        view: () => Promise.resolve({ default: () => "hero" }),
      }),
    ]);

    expect(() =>
      renderToStaticMarkup(
        renderBlockTree([{ id: "a", name: "site/hero" }], registry),
      ),
    ).toThrow('The view of block "site/hero" isn\'t loaded.');
  });

  test("the walker renders the module's error fallback when a loader rejected", async () => {
    const spec = defineBlock({
      name: "site/hero",
      view: () =>
        Promise.resolve({
          default: () => "hero",
          errorFallback: () => "fallback",
        }),
    });
    const registry = createBlockRegistry([spec]);
    await loadBlockViews(registry);

    const html = renderToStaticMarkup(
      renderBlockTree([{ id: "a", name: "site/hero" }], registry, {
        loaderData: new Map([["a", { loaders: {}, error: new Error("x") }]]),
      }),
    );

    expect(html).toBe("<div>fallback</div>");
  });

  test("loaders resolve from the module's loaders", async () => {
    const spec = defineBlock({
      name: "site/hero",
      view: () =>
        Promise.resolve({
          default: () => "hero",
          loaders: { greeting: () => Promise.resolve("hello") },
        }),
    });
    const registry = createBlockRegistry([spec]);
    await loadBlockViews(registry);

    const resolved = await resolveBlockLoaders(
      [{ id: "a", name: "site/hero" }],
      registry,
      {},
    );

    expect(resolved.get("a")).toEqual({
      loaders: { greeting: "hello" },
      error: null,
    });
  });

  test("dep keys come from the module's deps", async () => {
    const spec = defineBlock({
      name: "site/hero",
      view: () =>
        Promise.resolve({
          default: () => "hero",
          deps: { menus: ["primary"] },
        }),
    });
    const registry = createBlockRegistry([spec]);
    await loadBlockViews(registry);

    const keys = collectBlockDepKeys(
      [[{ id: "a", name: "site/hero" }]],
      registry,
    );

    expect(keys).toEqual({ menus: ["primary"] });
  });
});

describe("loadedBlocksWithLoaders", () => {
  test("names the loaded blocks whose view module declares loaders", async () => {
    const withLoaders = (name: string) =>
      defineBlock({
        name,
        view: () =>
          Promise.resolve({
            default: () => null,
            loaders: { posts: () => Promise.resolve([]) },
          }),
      });
    const registry = createBlockRegistry([
      withLoaders("site/feed"),
      withLoaders("site/unloaded-feed"),
      defineBlock({
        name: "site/hero",
        view: () => Promise.resolve({ default: () => null }),
      }),
    ]);
    await loadBlockViews(registry, ["site/feed", "site/hero"]);

    expect(loadedBlocksWithLoaders(registry)).toEqual(["site/feed"]);
  });
});

/** Runs every queued promise job, so a rejection that is ready has landed. */
function drainPromiseJobs(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("a view module that fails to import", () => {
  test("rejects only once the other views have loaded, and a later call retries it", async () => {
    let attempts = 0;
    const flaky = defineBlock({
      name: "site/flaky",
      view: () => {
        attempts += 1;
        return attempts === 1
          ? Promise.reject(new Error("chunk 404"))
          : Promise.resolve({ default: () => "flaky" });
      },
    });
    let release = (): void => undefined;
    const slow = defineBlock({
      name: "site/slow",
      view: () =>
        new Promise<BlockViewModule>((resolve) => {
          release = () => resolve({ default: () => "slow" });
        }),
    });
    const registry = createBlockRegistry([flaky, slow]);
    let settledEarly = false;

    const first = loadBlockViews(registry).finally(() => {
      settledEarly = true;
    });
    await drainPromiseJobs();
    const beforeRelease = settledEarly;
    release();
    await expect(first).rejects.toThrow("chunk 404");
    await loadBlockViews(registry);

    expect([beforeRelease, attempts, blockViewModule(slow).default]).toEqual([
      false,
      2,
      expect.any(Function),
    ]);
    expect(blockViewModule(flaky).default).toEqual(expect.any(Function));
  });
});
