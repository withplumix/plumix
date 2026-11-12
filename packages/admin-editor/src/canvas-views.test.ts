import { describe, expect, test } from "vitest";

import type { BlockNode, BlockViewModule } from "@plumix/core/blocks";
import {
  createBlockRegistry,
  defineBlock,
  loadBlockViews,
} from "@plumix/core/blocks";

import {
  createLoaderBlocksReporter,
  createTreeCommitter,
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
  test("commits a tree only once its blocks' views have loaded", async () => {
    const hero = deferredBlock("site/hero", blank);
    const registry = createBlockRegistry([hero.spec]);
    const committed: (readonly BlockNode[])[] = [];
    const offer = createTreeCommitter(registry, (names) =>
      loadBlockViews(registry, names),
    );
    const tree = [{ id: "a", name: "site/hero" }];

    const landing = offer(tree, (next) => committed.push(next));
    const beforeLoad = committed.length;
    hero.release();
    await landing;

    expect([beforeLoad, committed]).toEqual([0, [tree]]);
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

describe("createLoaderBlocksReporter", () => {
  test("reports the loaded blocks that declare loaders, and again when more load", async () => {
    const feed = deferredBlock("site/feed", {
      default: () => null,
      loaders: { posts: () => Promise.resolve([]) },
    });
    const search = deferredBlock("site/search", {
      default: () => null,
      loaders: { hits: () => Promise.resolve([]) },
    });
    const registry = createBlockRegistry([feed.spec, search.spec]);
    const reports: (readonly string[])[] = [];
    const reporter = createLoaderBlocksReporter(registry, (names) =>
      reports.push(names),
    );

    feed.release();
    await loadBlockViews(registry, ["site/feed"]);
    reporter.update();
    reporter.update();
    search.release();
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
