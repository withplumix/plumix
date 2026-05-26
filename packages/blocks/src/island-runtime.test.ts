import { afterEach, beforeEach, describe, expect, test } from "vitest";

import { ISLAND_TAG, setDynamicImport } from "./island-element.js";

describe("bootstrapIslandRuntime", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    document.head.innerHTML = "";
    delete (window as { Plumix?: unknown }).Plumix;
  });

  afterEach(() => {
    document.head.innerHTML = "";
    delete (window as { Plumix?: unknown }).Plumix;
  });

  test("registers the custom element + the load strategy at import time", async () => {
    await import("./island-runtime.js");
    expect(customElements.get(ISLAND_TAG)).toBeDefined();
    expect(
      typeof (window as { Plumix?: Record<string, unknown> }).Plumix?.load,
    ).toBe("function");
  });

  test("registers all five hydration strategies on window.Plumix", async () => {
    // Call the exported bootstrap directly: the module-body invocation runs
    // once (module cache), but beforeEach clears window.Plumix, so we
    // re-bootstrap to populate it deterministically.
    const { bootstrapIslandRuntime } = await import("./island-runtime.js");
    bootstrapIslandRuntime();
    const plumix = (window as { Plumix?: Record<string, unknown> }).Plumix;
    for (const name of ["load", "idle", "visible", "interaction", "only"]) {
      expect(typeof plumix?.[name]).toBe("function");
    }
  });

  test("re-running bootstrap is idempotent", async () => {
    const { bootstrapIslandRuntime } = await import("./island-runtime.js");
    bootstrapIslandRuntime();
    bootstrapIslandRuntime();
    expect(customElements.get(ISLAND_TAG)).toBeDefined();
  });

  test("threads data-plumix-renderer-url from the bootstrap script to the element", async () => {
    const { bootstrapIslandRuntime } = await import("./island-runtime.js");
    // The SSR-injected bootstrap script carries the renderer chunk URL.
    const script = document.createElement("script");
    script.setAttribute("data-plumix-renderer-url", "/assets/renderer-xyz.js");
    document.head.appendChild(script);
    bootstrapIslandRuntime();

    // Observe the effect: the element's default renderer loader imports
    // exactly that URL on hydrate.
    const imported: string[] = [];
    const restore = setDynamicImport((url) => {
      imported.push(url);
      return Promise.resolve({
        default: () => null,
        mount: () => ({ render: () => undefined, unmount: () => undefined }),
      });
    });
    window.Plumix = { load: (loadFn) => loadFn() };
    const el = document.createElement(ISLAND_TAG);
    el.setAttribute("client", "load");
    el.setAttribute("chunk-url", "/chunk.js");
    el.setAttribute("component-export", "default");
    document.body.appendChild(el);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(imported).toContain("/assets/renderer-xyz.js");
    restore();
    el.remove();
  });
});
