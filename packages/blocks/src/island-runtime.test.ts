import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { ISLAND_TAG } from "./island-element.js";

describe("bootstrapIslandRuntime", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as { Plumix?: unknown }).Plumix;
  });

  afterEach(() => {
    delete (window as { Plumix?: unknown }).Plumix;
  });

  test("registers the custom element + the load strategy at import time", async () => {
    await import("./island-runtime.js");
    expect(customElements.get(ISLAND_TAG)).toBeDefined();
    expect(
      typeof (window as { Plumix?: Record<string, unknown> }).Plumix?.load,
    ).toBe("function");
  });

  test("re-running bootstrap is idempotent", async () => {
    const { bootstrapIslandRuntime } = await import("./island-runtime.js");
    bootstrapIslandRuntime();
    bootstrapIslandRuntime();
    expect(customElements.get(ISLAND_TAG)).toBeDefined();
  });
});
