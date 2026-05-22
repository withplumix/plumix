import { afterEach, describe, expect, test } from "vitest";

import { registerPluginBlock } from "./plugin-registry.js";
import { bootPlumixGlobals } from "./plumix-globals.js";

afterEach(() => {
  delete (window as { plumix?: unknown }).plumix;
});

describe("plumix globals bridge", () => {
  test("exposes registerPluginBlock as the same function from plugin-registry", () => {
    bootPlumixGlobals();
    expect(window.plumix?.registerPluginBlock).toBe(registerPluginBlock);
  });
});
