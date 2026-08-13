import { afterEach, describe, expect, test } from "vitest";

import { coreBlocks, defineBlock } from "@plumix/blocks";

import {
  _resetPluginRegistry,
  getRegisteredBlocks,
  registerPluginBlock,
} from "../lib/plugin-registry.js";
import { registerCoreBlocks } from "./register-core-blocks.js";

afterEach(() => {
  _resetPluginRegistry();
});

describe("synthetic core-plugin block registration", () => {
  test("registers every coreBlocks entry into the runtime registry in order", () => {
    registerCoreBlocks();
    const runtime = getRegisteredBlocks();
    expect(runtime.map((s) => s.name)).toEqual(coreBlocks.map((s) => s.name));
  });

  test("is idempotent under React StrictMode's double-invoke", () => {
    registerCoreBlocks();
    expect(() => registerCoreBlocks()).not.toThrow();
    expect(getRegisteredBlocks()).toHaveLength(coreBlocks.length);
  });

  test("still registers core when many non-core blocks precede it", () => {
    // The site-bundle registers theme/plugin blocks before this runs. Enough of
    // them to exceed coreBlocks.length would trip a length-threshold guard into
    // skipping core entirely — the guard must key on a core name instead.
    for (let i = 0; i < coreBlocks.length; i++) {
      registerPluginBlock(defineBlock({ name: `x/b${i}`, render: () => null }));
    }
    registerCoreBlocks();
    const names = new Set(getRegisteredBlocks().map((s) => s.name));
    for (const spec of coreBlocks) expect(names.has(spec.name)).toBe(true);
  });
});
