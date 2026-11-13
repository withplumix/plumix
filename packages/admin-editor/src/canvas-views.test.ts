import { afterEach, describe, expect, test, vi } from "vitest";

import type { BlockNode, BlockViewModule } from "@plumix/core/blocks";
import {
  createBlockRegistry,
  defineBlock,
  loadBlockViews,
  loadedBlocksWithLoaders,
} from "@plumix/core/blocks";

import {
  createLoaderBlocksReporter,
  createTreeCommitter,
  scheduleViewModuleLoads,
  seedTree,
  settleViewModuleLoad,
  treeBlockNames,
} from "./canvas-views.js";

/** A block whose view module arrives only when the test releases it. */
function deferredBlock(name: string, module: BlockViewModule) {
  let release = (): void => undefined;
  const arrived = new Promise<BlockViewModule>((resolve) => {
    release = () => resolve(module);
  });
  return { spec: defineBlock({ name, view: () => arrived }), release };
}

const blank: BlockViewModule = { default: () => null };

describe("treeBlockNames", () => {
  test("names every block in the tree, slot children included", () => {
    const registry = createBlockRegistry([
      defineBlock({
        name: "site/box",
        inputs: [{ name: "content", type: "slot" }],
        view: () => Promise.resolve(blank),
      }),
    ]);
    const tree: readonly BlockNode[] = [
      {
        id: "a",
        name: "site/box",
        attrs: { content: [{ id: "b", name: "site/card" }] },
      },
      { id: "c", name: "site/hero" },
    ];

    expect([...treeBlockNames(tree, registry)]).toEqual([
      "site/box",
      "site/card",
      "site/hero",
    ]);
  });
});

describe("createTreeCommitter", () => {
  test("commits nothing while a tree's view modules load", () => {
    const hero = deferredBlock("site/hero", blank);
    const registry = createBlockRegistry([hero.spec]);
    const committed: (readonly BlockNode[])[] = [];
    const offer = createTreeCommitter(registry, (names) =>
      loadBlockViews(registry, names),
    );

    void offer([{ id: "a", name: "site/hero" }], (next) =>
      committed.push(next),
    );

    expect(committed).toEqual([]);
  });

  test("commits a tree once its blocks' view modules have loaded", async () => {
    const hero = deferredBlock("site/hero", blank);
    const registry = createBlockRegistry([hero.spec]);
    const committed: (readonly BlockNode[])[] = [];
    const offer = createTreeCommitter(registry, (names) =>
      loadBlockViews(registry, names),
    );
    const tree = [{ id: "a", name: "site/hero" }];
    const landing = offer(tree, (next) => committed.push(next));

    hero.release();
    await landing;

    expect(committed).toEqual([tree]);
  });

  test("of two trees offered while the first loads, only the newer commits", async () => {
    const hero = deferredBlock("site/hero", blank);
    const registry = createBlockRegistry([hero.spec]);
    const committed: (readonly BlockNode[])[] = [];
    const offer = createTreeCommitter(registry, (names) =>
      loadBlockViews(registry, names),
    );
    const older = [{ id: "a", name: "site/hero" }];
    const newer = [{ id: "b", name: "site/hero" }];

    const first = offer(older, (next) => committed.push(next));
    const second = offer(newer, (next) => committed.push(next));
    hero.release();
    await Promise.all([first, second]);

    expect(committed).toEqual([newer]);
  });
});

/** A registry of two blocks with loaders and one without, all loadable. */
function loaderRegistry() {
  const withLoaders = (name: string) =>
    defineBlock({
      name,
      view: () =>
        Promise.resolve({
          default: () => null,
          loaders: { rows: () => Promise.resolve([]) },
        }),
    });
  return createBlockRegistry([
    withLoaders("site/feed"),
    withLoaders("site/search"),
    defineBlock({ name: "site/hero", view: () => Promise.resolve(blank) }),
  ]);
}

describe("createLoaderBlocksReporter", () => {
  test("reports the loaded blocks that declare loaders", async () => {
    const registry = loaderRegistry();
    const reports: (readonly string[])[] = [];
    const reporter = createLoaderBlocksReporter(registry, (names) =>
      reports.push(names),
    );
    await loadBlockViews(registry, ["site/feed", "site/hero"]);

    reporter.update();

    expect(reports).toEqual([["site/feed"]]);
  });

  test("reports nothing when the set hasn't changed", async () => {
    const registry = loaderRegistry();
    const reports: (readonly string[])[] = [];
    const reporter = createLoaderBlocksReporter(registry, (names) =>
      reports.push(names),
    );
    await loadBlockViews(registry, ["site/feed"]);
    reporter.update();

    reporter.update();

    expect(reports).toEqual([["site/feed"]]);
  });

  test("reports again once more blocks with loaders load", async () => {
    const registry = loaderRegistry();
    const reports: (readonly string[])[] = [];
    const reporter = createLoaderBlocksReporter(registry, (names) =>
      reports.push(names),
    );
    await loadBlockViews(registry, ["site/feed"]);
    reporter.update();
    await loadBlockViews(registry, ["site/search"]);

    reporter.update();

    expect(reports).toEqual([["site/feed"], ["site/feed", "site/search"]]);
  });

  test("resends the current set for a host that just connected", () => {
    const registry = createBlockRegistry([]);
    const reports: (readonly string[])[] = [];
    const reporter = createLoaderBlocksReporter(registry, (names) =>
      reports.push(names),
    );
    reporter.update();

    reporter.resend();

    expect(reports).toEqual([[], []]);
  });
});

/** A block whose first import fails, as a chunk 404 after a deploy does. */
function failsOnceBlock(name: string) {
  let attempts = 0;
  return defineBlock({
    name,
    view: () => {
      attempts += 1;
      return attempts === 1
        ? Promise.reject(new Error("chunk 404"))
        : Promise.resolve(blank);
    },
  });
}

const HERO_AND_FEED: readonly BlockNode[] = [
  { id: "a", name: "site/hero" },
  { id: "b", name: "site/feed" },
];

/**
 * A canvas whose `site/hero` view module fails its first import and whose `site/feed`
 * view module loads and declares loaders.
 */
function canvasWithFailingView() {
  const feed = defineBlock({
    name: "site/feed",
    view: () =>
      Promise.resolve({
        default: () => null,
        loaders: { posts: () => Promise.resolve([]) },
      }),
  });
  const registry = createBlockRegistry([failsOnceBlock("site/hero"), feed]);
  const committed: (readonly BlockNode[])[] = [];
  const reports: (readonly string[])[] = [];
  const reporter = createLoaderBlocksReporter(registry, (names) =>
    reports.push(names),
  );
  const offer = createTreeCommitter(registry, (names) =>
    loadBlockViews(registry, names),
  );
  return { offer, reporter, committed, reports };
}

describe("a view module that fails to load in the canvas", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("keeps the previous tree when one of its view modules fails to load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { offer, reporter, committed } = canvasWithFailingView();

    await settleViewModuleLoad(
      offer(HERO_AND_FEED, (next) => committed.push(next)),
      reporter.update,
    );

    expect(committed).toEqual([]);
  });

  test("still reports the loader blocks whose view modules loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { offer, reporter, committed, reports } = canvasWithFailingView();

    await settleViewModuleLoad(
      offer(HERO_AND_FEED, (next) => committed.push(next)),
      reporter.update,
    );

    expect(reports).toEqual([["site/feed"]]);
  });

  test("offering the tree again retries the import and commits it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry = createBlockRegistry([failsOnceBlock("site/hero")]);
    const committed: (readonly BlockNode[])[] = [];
    const offer = createTreeCommitter(registry, (names) =>
      loadBlockViews(registry, names),
    );
    const tree = [{ id: "a", name: "site/hero" }];
    await settleViewModuleLoad(
      offer(tree, (next) => committed.push(next)),
      () => undefined,
    );

    await settleViewModuleLoad(
      offer(tree, (next) => committed.push(next)),
      () => undefined,
    );

    expect(committed).toEqual([tree]);
  });

  test("reports the failure on the console", async () => {
    const logged = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const registry = createBlockRegistry([failsOnceBlock("site/hero")]);

    await settleViewModuleLoad(loadBlockViews(registry), () => undefined);

    expect(logged).toHaveBeenCalledWith(
      "[plumix:editor] A block's view module failed to load; the canvas keeps what it shows and retries on the next update.",
      new Error("chunk 404"),
    );
  });

  test("mounts an empty seed when its view modules fail, so the host's tree push retries them", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const registry = createBlockRegistry([failsOnceBlock("site/hero")]);

    const seed = await seedTree(registry, [{ id: "a", name: "site/hero" }]);

    expect(seed).toEqual([]);
  });

  test("mounts the seed itself once its view modules load", async () => {
    const registry = createBlockRegistry([
      defineBlock({ name: "site/hero", view: () => Promise.resolve(blank) }),
    ]);
    const tree = [{ id: "a", name: "site/hero" }];

    const seed = await seedTree(registry, tree);

    expect(seed).toBe(tree);
  });
});

/** Two blocks whose view module imports the test can count. */
function countedRegistry() {
  const hero = vi.fn(() => Promise.resolve(blank));
  const feed = vi.fn(() => Promise.resolve(blank));
  const registry = createBlockRegistry([
    defineBlock({ name: "site/hero", view: hero }),
    defineBlock({ name: "site/feed", view: feed }),
  ]);
  return { registry, hero, feed };
}

/** A `requestIdleCallback` whose pending tasks the test runs by hand. */
function stubIdleCallback() {
  const pending = new Map<number, () => void>();
  let next = 0;
  vi.stubGlobal("requestIdleCallback", (task: () => void) => {
    next += 1;
    pending.set(next, task);
    return next;
  });
  vi.stubGlobal("cancelIdleCallback", (handle: number) => {
    pending.delete(handle);
  });
  return {
    runIdle: () => {
      for (const task of pending.values()) task();
      pending.clear();
    },
  };
}

describe("scheduleViewModuleLoads", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  test("imports no view module before the browser is idle", () => {
    stubIdleCallback();
    const { registry, hero, feed } = countedRegistry();

    scheduleViewModuleLoads(registry, () => undefined);

    expect([hero.mock.calls.length, feed.mock.calls.length]).toEqual([0, 0]);
  });

  test("imports every view module once the browser is idle", () => {
    const idle = stubIdleCallback();
    const { registry, hero, feed } = countedRegistry();
    scheduleViewModuleLoads(registry, () => undefined);

    idle.runIdle();

    expect([hero.mock.calls.length, feed.mock.calls.length]).toEqual([1, 1]);
  });

  test("falls back to a timer where there is no requestIdleCallback", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const { registry, hero, feed } = countedRegistry();
    scheduleViewModuleLoads(registry, () => undefined);

    vi.runAllTimers();

    expect([hero.mock.calls.length, feed.mock.calls.length]).toEqual([1, 1]);
  });

  test("imports nothing at idle once cancelled", () => {
    const idle = stubIdleCallback();
    const { registry, hero, feed } = countedRegistry();
    const loads = scheduleViewModuleLoads(registry, () => undefined);
    loads.cancel();

    idle.runIdle();

    expect([hero.mock.calls.length, feed.mock.calls.length]).toEqual([0, 0]);
  });

  test("imports nothing from the fallback timer once cancelled", () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const { registry, hero, feed } = countedRegistry();
    const loads = scheduleViewModuleLoads(registry, () => undefined);
    loads.cancel();

    vi.runAllTimers();

    expect([hero.mock.calls.length, feed.mock.calls.length]).toEqual([0, 0]);
  });

  test("a prefetch imports exactly the named view modules", () => {
    stubIdleCallback();
    const { registry, hero, feed } = countedRegistry();
    const loads = scheduleViewModuleLoads(registry, () => undefined);

    loads.prefetch(["site/feed"]);

    expect([hero.mock.calls.length, feed.mock.calls.length]).toEqual([0, 1]);
  });

  test("calls back once a prefetch's view modules have loaded", async () => {
    stubIdleCallback();
    const registry = loaderRegistry();
    let settled!: (names: readonly string[]) => void;
    const afterLoad = new Promise<readonly string[]>((resolve) => {
      settled = resolve;
    });
    const loads = scheduleViewModuleLoads(registry, () =>
      settled(loadedBlocksWithLoaders(registry)),
    );

    loads.prefetch(["site/feed"]);

    expect(await afterLoad).toEqual(["site/feed"]);
  });
});
