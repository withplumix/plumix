import { afterEach, describe, expect, test } from "vitest";

import { coreBlocks } from "@plumix/blocks";

import {
  _resetPluginRegistry,
  getRegisteredBlocks,
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
});
