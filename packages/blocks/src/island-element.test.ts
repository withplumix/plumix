import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { IslandStrategy } from "./island-element.js";
import {
  ISLAND_TAG,
  PlumixIslandElement,
  registerIslandElement,
  setDynamicImport,
  setRendererImport,
  setRendererUrl,
} from "./island-element.js";
// The real renderer chunk, injected via the seam — jsdom can't import a
// renderer chunk by URL, so unit tests hand the element the actual module.
import * as islandRenderer from "./island-renderer.js";
import { serializeProps } from "./serialize.js";

function makeIsland(attrs: Record<string, string>): PlumixIslandElement {
  registerIslandElement();
  const el = document.createElement(ISLAND_TAG) as PlumixIslandElement;
  for (const [key, value] of Object.entries(attrs)) {
    el.setAttribute(key, value);
  }
  return el;
}

const stubStrategies = (
  load: IslandStrategy = (loadFn) => loadFn(),
): IslandStrategy => {
  window.Plumix = { load };
  return load;
};

describe("registerIslandElement", () => {
  beforeEach(() => {
    // Clear the document between cases — registered tag persists since
    // customElements.define cannot be undone in a window's lifetime.
    document.body.innerHTML = "";
  });

  test("registers the <plumix-island> custom element exactly once", () => {
    registerIslandElement();
    const first = customElements.get(ISLAND_TAG);
    registerIslandElement();
    const second = customElements.get(ISLAND_TAG);
    expect(first).toBe(second);
    expect(first).toBe(PlumixIslandElement);
  });
});

describe("PlumixIslandElement lifecycle", () => {
  let restoreImport: () => void = () => undefined;
  let restoreRenderer: () => void = () => undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as { Plumix?: unknown }).Plumix;
    restoreImport = () => undefined;
    // Hand the element the real renderer module; production resolves it
    // from a chunk URL, which jsdom can't import.
    restoreRenderer = setRendererImport(() => Promise.resolve(islandRenderer));
  });

  afterEach(async () => {
    restoreImport();
    restoreRenderer();
    // Detach any islands the test mounted so the React scheduler
    // unmounts their roots before the next test (or vitest's jsdom
    // teardown). React 19's scheduler queues work via setImmediate /
    // MessageChannel; without a clean unmount + microtask drain, the
    // deferred callback fires after jsdom is torn down and throws
    // `ReferenceError: window is not defined`, which vitest reports as
    // an unhandled error and fails the run.
    document.body.innerHTML = "";
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("connectedCallback invokes the registered `load` strategy", async () => {
    const strategy = vi.fn<IslandStrategy>();
    stubStrategies(strategy);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "Search",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(strategy).toHaveBeenCalledTimes(1);
    expect(strategy.mock.calls[0]?.[2]).toBe(el);
  });

  test("`await-children` delays start until ssr-complete is set", async () => {
    const strategy = vi.fn<IslandStrategy>();
    stubStrategies(strategy);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "await-children": "",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(strategy).not.toHaveBeenCalled();
    el.setAttribute("ssr-complete", "");
    // Wait two microtasks for MutationObserver + the start() promise.
    await Promise.resolve();
    await Promise.resolve();
    expect(strategy).toHaveBeenCalledTimes(1);
  });

  test("disconnectedCallback dispatches `plumix:unmount` on window with element in detail", async () => {
    // Forward-compat with future view-transitions / client-side
    // navigation: when an island is removed from the DOM (e.g. a route
    // swap unmounts the page), themes can listen for `plumix:unmount`
    // to clean up subscriptions before React's `root.unmount()` runs.
    // Dispatched on window because the element is already detached
    // when disconnectedCallback fires.
    stubStrategies();
    restoreImport = setDynamicImport(() =>
      Promise.resolve({ default: () => null } as unknown),
    );
    const listener = vi.fn();
    window.addEventListener("plumix:unmount", listener);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "default",
      opts: "{}",
    });
    document.body.appendChild(el);
    await new Promise((resolve) => setTimeout(resolve, 0));
    el.remove();
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent<{
      element: PlumixIslandElement;
    }>;
    expect(event.detail.element).toBe(el);
    window.removeEventListener("plumix:unmount", listener);
  });

  test("a never-hydrated (deferred) island that disconnects does NOT emit `plumix:unmount`", async () => {
    // A nested child blocked on the parent's `ssr` attribute that gets
    // detached before its parent ever hydrates. No mount happened, so
    // no unmount event should fire — listeners pair the two.
    //
    // Strategy captures loadFn without invoking it so neither parent
    // nor child ever progresses past `start()` — keeps the test focused
    // on the unmount-event contract without leaking an in-flight
    // `dynamicImport` into the next test.
    stubStrategies(() => undefined);
    const listener = vi.fn();
    window.addEventListener("plumix:unmount", listener);
    const parent = makeIsland({
      client: "load",
      "chunk-url": "/parent.js",
      opts: "{}",
      ssr: "",
    });
    const child = makeIsland({
      client: "load",
      "chunk-url": "/child.js",
      opts: "{}",
      ssr: "",
    });
    parent.appendChild(child);
    document.body.appendChild(parent);
    await Promise.resolve();
    // Detach the child WHILE it's still deferred. The parentObserver
    // teardown should also run (no leaked MutationObserver) but the
    // observable surface here is the absence of plumix:unmount.
    child.remove();
    expect(listener).not.toHaveBeenCalled();
    window.removeEventListener("plumix:unmount", listener);
  });

  test("a nested island defers its strategy until the parent island clears its `ssr` attribute", async () => {
    // SSR'd structure: <plumix-island ssr><...inner content with another
    // <plumix-island ssr>...></plumix-island>. The child must NOT
    // hydrate while the parent is still marked SSR — Astro's top-down
    // contract. Walker emits both with `ssr=""`; each clears its own
    // attribute after its `hydrate()` runs.
    const strategy = vi.fn<IslandStrategy>((loadFn) => loadFn());
    stubStrategies(strategy);
    const importer = vi.fn(() =>
      Promise.resolve({ default: () => null } as unknown),
    );
    restoreImport = setDynamicImport(importer);
    const parent = makeIsland({
      client: "load",
      "chunk-url": "/parent.js",
      "component-export": "default",
      opts: "{}",
      ssr: "",
    });
    const child = makeIsland({
      client: "load",
      "chunk-url": "/child.js",
      "component-export": "default",
      opts: "{}",
      ssr: "",
    });
    parent.appendChild(child);
    document.body.appendChild(parent);
    // Yield one microtask; child should defer, only the parent should
    // have invoked its strategy.
    await Promise.resolve();
    await Promise.resolve();
    const childStrategyCalls = strategy.mock.calls.filter(
      (call) => call[2] === child,
    );
    expect(childStrategyCalls).toHaveLength(0);

    // Parent clears its ssr attribute → child should hydrate next tick.
    parent.removeAttribute("ssr");
    await Promise.resolve();
    await Promise.resolve();
    const childStrategyCallsAfter = strategy.mock.calls.filter(
      (call) => call[2] === child,
    );
    expect(childStrategyCallsAfter).toHaveLength(1);
  });

  test("start() bails when the element is no longer connected by the time the strategy fires", async () => {
    // Real-world: connectedCallback fires, strategy schedules an async
    // import, the parent React render unmounts the island wrapper before
    // the import resolves. createRoot on a detached node would throw.
    let deferredLoad: (() => Promise<void>) | undefined;
    stubStrategies((loadFn) => {
      // Capture loadFn without invoking it — defers hydration.
      deferredLoad = loadFn;
    });
    const importer = vi.fn(() =>
      Promise.resolve({ default: () => null } as unknown),
    );
    restoreImport = setDynamicImport(importer);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "default",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    // Detach BEFORE the strategy's loadFn runs.
    el.remove();
    expect(el.isConnected).toBe(false);
    await deferredLoad?.();
    // hydrate's component lookup should never have fired.
    expect(importer).not.toHaveBeenCalled();
  });

  test("rejects a __proto__ component-export with plumix:hydration-error (proto pollution guard)", async () => {
    stubStrategies();
    const listener = vi.fn();
    window.addEventListener("plumix:hydration-error", listener);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "__proto__",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    window.removeEventListener("plumix:hydration-error", listener);
  });

  test("dispatches plumix:hydration-error when no strategy is registered", async () => {
    const listener = vi.fn();
    window.addEventListener("plumix:hydration-error", listener);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent;
    expect(event.cancelable).toBe(true);
    window.removeEventListener("plumix:hydration-error", listener);
  });

  test("retries the chunk import with #plumix-retry hash after one failure", async () => {
    vi.useFakeTimers();
    const calls: string[] = [];
    restoreImport = setDynamicImport((url) => {
      calls.push(url);
      if (calls.length === 1) return Promise.reject(new Error("network blip"));
      return Promise.resolve({ Search: () => null });
    });
    stubStrategies();
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "Search",
      opts: "{}",
    });
    document.body.appendChild(el);
    // First import fails immediately; the retry sleeps 1000ms before
    // firing.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    expect(calls).toHaveLength(2);
    expect(calls[0]).toBe("/chunk.js");
    expect(calls[1]).toMatch(/^\/chunk\.js#plumix-retry=\d+$/);
    vi.useRealTimers();
  });

  test("dispatches plumix:hydration-error after the second import failure", async () => {
    vi.useFakeTimers();
    restoreImport = setDynamicImport(() => Promise.reject(new Error("404")));
    stubStrategies();
    const listener = vi.fn();
    window.addEventListener("plumix:hydration-error", listener);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "Search",
      opts: "{}",
    });
    document.body.appendChild(el);
    await vi.advanceTimersByTimeAsync(1100);
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0]?.[0] as CustomEvent;
    expect(event.cancelable).toBe(true);
    window.removeEventListener("plumix:hydration-error", listener);
    vi.useRealTimers();
  });

  test("re-renders the component when the `props` attribute changes after mount", async () => {
    const seen: Readonly<Record<string, unknown>>[] = [];
    const Component = (props: Readonly<Record<string, unknown>>) => {
      seen.push(props);
      return null;
    };
    restoreImport = setDynamicImport(() =>
      Promise.resolve({ default: Component } as unknown),
    );
    stubStrategies();
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "default",
      opts: "{}",
      props: serializeProps({ title: "first" }),
    });
    document.body.appendChild(el);
    // React 19 concurrent commits don't land in a single setTimeout(0)
    // tick — poll until the first render lands.
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({ title: "first" });

    el.setAttribute("props", serializeProps({ title: "second" }));
    await vi.waitFor(() => expect(seen).toHaveLength(2));
    expect(seen[1]).toEqual({ title: "second" });
  });

  test("retries the renderer chunk import with a cache-bust after one failure", async () => {
    // The renderer URL is resolved from the SSR manifest exactly like the
    // per-island chunk URL, so it gets the same deploy-during-load defense:
    // one cache-busted retry before surfacing a hydration error.
    vi.useFakeTimers();
    // Drop back to the default URL-based renderer loader (the suite's
    // beforeEach injects the real module directly; here we exercise the
    // network path).
    restoreRenderer();
    setRendererUrl("/renderer.js");
    const calls: string[] = [];
    restoreImport = setDynamicImport((url) => {
      calls.push(url);
      if (url.startsWith("/renderer.js") && !url.includes("plumix-retry")) {
        return Promise.reject(new Error("renderer blip"));
      }
      return Promise.resolve({
        default: () => null,
        mount: islandRenderer.mount,
      });
    });
    stubStrategies();
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "default",
      opts: "{}",
    });
    document.body.appendChild(el);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    const rendererCalls = calls.filter((u) => u.startsWith("/renderer.js"));
    expect(rendererCalls).toHaveLength(2);
    expect(rendererCalls[1]).toMatch(/#plumix-retry=\d+$/);
    vi.useRealTimers();
  });

  test("declares `props` in observedAttributes", () => {
    expect(PlumixIslandElement.observedAttributes).toContain("props");
  });

  test("extracts SSR'd slot HTML and forwards it as a React-element prop on hydrate", async () => {
    // When the SSR shim wraps a React-element prop in <plumix-static-slot>,
    // the wrapper carries a `slots="<name>,<name>"` attribute listing
    // those props. On hydrate the custom element finds each matching
    // descendant and feeds its innerHTML back as a StaticHtml element
    // bridged into the same prop slot.
    const seen: Readonly<Record<string, unknown>>[] = [];
    const Component = (props: Readonly<Record<string, unknown>>) => {
      seen.push(props);
      return null;
    };
    restoreImport = setDynamicImport(() =>
      Promise.resolve({ default: Component } as unknown),
    );
    stubStrategies();
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "default",
      opts: "{}",
      props: serializeProps({ label: "x" }),
      slots: "children",
    });
    // Drop a SSR'd slot inside the wrapper, as the server would emit.
    el.innerHTML =
      '<plumix-static-slot data-plumix-slot="children"><strong>child-text</strong></plumix-static-slot>';
    document.body.appendChild(el);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]?.label).toBe("x");
    // The slot value should now be a React element (the StaticHtml bridge)
    // — the simplest observable is `$$typeof === Symbol`.
    const childrenProp = seen[0]?.children as { $$typeof?: symbol } | undefined;
    expect(typeof childrenProp?.$$typeof).toBe("symbol");
  });

  test("nested-island slot is NOT claimed by the parent island", async () => {
    // A nested <plumix-island> has its own <plumix-static-slot> child.
    // The parent island's slot collector must filter via
    // `closest('plumix-island') === this` so the inner slot doesn't get
    // stolen and the nested island's children stay intact.
    const seen: Readonly<Record<string, unknown>>[] = [];
    const Component = (props: Readonly<Record<string, unknown>>) => {
      seen.push(props);
      return null;
    };
    restoreImport = setDynamicImport(() =>
      Promise.resolve({ default: Component } as unknown),
    );
    stubStrategies();
    const parent = makeIsland({
      client: "load",
      "chunk-url": "/p.js",
      "component-export": "default",
      opts: "{}",
      props: serializeProps({}),
      slots: "children",
    });
    parent.innerHTML = `
      <plumix-island ssr="" client="load" chunk-url="/c.js" component-export="default" props="{}" slots="children">
        <plumix-static-slot data-plumix-slot="children">child-slot</plumix-static-slot>
      </plumix-island>
    `;
    document.body.appendChild(parent);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    // Parent's children slot has no direct descendant <plumix-static-slot>
    // it can claim (the only one belongs to the nested child), so its
    // `children` prop is absent.
    expect(seen[0]?.children).toBeUndefined();
  });

  test("reads props from the `props` attribute and forwards them to the component", async () => {
    const seen: Readonly<Record<string, unknown>>[] = [];
    const Component = (props: Readonly<Record<string, unknown>>) => {
      seen.push(props);
      return null;
    };
    restoreImport = setDynamicImport(() =>
      Promise.resolve({ default: Component } as unknown),
    );
    stubStrategies();
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "default",
      opts: "{}",
      props: serializeProps({ title: "hello", n: 42 }),
    });
    document.body.appendChild(el);
    await vi.waitFor(() => expect(seen).toHaveLength(1));
    expect(seen[0]).toEqual({ title: "hello", n: 42 });
  });
});

describe("PlumixIslandElement prefetch/hydrate split", () => {
  let restoreImport: () => void = () => undefined;
  let restoreRenderer: () => void = () => undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as { Plumix?: unknown }).Plumix;
    restoreImport = () => undefined;
    restoreRenderer = setRendererImport(() => Promise.resolve(islandRenderer));
  });

  afterEach(async () => {
    restoreImport();
    restoreRenderer();
    document.body.innerHTML = "";
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  test("wires prefetch separately from hydrate and warms the chunk without mounting", async () => {
    const imports: string[] = [];
    restoreImport = setDynamicImport((url) => {
      imports.push(url);
      return Promise.resolve({ default: () => null } as unknown);
    });
    let prefetchLoad: (() => Promise<void>) | undefined;
    let hydrateLoad: (() => Promise<void>) | undefined;
    window.Plumix = {
      visible: (loadFn) => {
        prefetchLoad = loadFn;
      },
      interaction: (loadFn) => {
        hydrateLoad = loadFn;
      },
    };
    const el = makeIsland({
      client: "interaction",
      prefetch: "visible",
      "chunk-url": "/chunk.js",
      "component-export": "default",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();

    // Both triggers are wired; nothing has been fetched yet.
    expect(typeof prefetchLoad).toBe("function");
    expect(typeof hydrateLoad).toBe("function");
    expect(imports).toEqual([]);

    // Firing the prefetch trigger warms the component chunk without mounting.
    await prefetchLoad?.();
    expect(imports).toContain("/chunk.js");
  });

  test("skips the prefetch strategy entirely when hydration is immediate (load)", async () => {
    const calls: string[] = [];
    window.Plumix = {
      load: () => {
        calls.push("load");
      },
      visible: () => {
        calls.push("visible");
      },
    };
    const el = makeIsland({
      client: "load",
      prefetch: "load",
      "chunk-url": "/c.js",
      "component-export": "default",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(calls).toEqual(["load"]);
  });

  test("does not double-wire when the prefetch trigger equals the hydrate trigger", async () => {
    const calls: string[] = [];
    window.Plumix = {
      visible: () => {
        calls.push("visible");
      },
    };
    const el = makeIsland({
      client: "visible",
      prefetch: "visible",
      "chunk-url": "/c.js",
      "component-export": "default",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(calls).toEqual(["visible"]);
  });

  test("runs a strategy's teardown when the island disconnects", async () => {
    const teardown = vi.fn();
    window.Plumix = { visible: () => teardown };
    const el = makeIsland({
      client: "visible",
      "chunk-url": "/c.js",
      "component-export": "default",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(teardown).not.toHaveBeenCalled();
    el.remove();
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});

describe("PlumixIslandElement edit-mode gate", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as { Plumix?: unknown }).Plumix;
  });

  afterEach(() => {
    delete document.documentElement.dataset.plumixMode;
  });

  test("does not hydrate while the page is in edit mode", async () => {
    document.documentElement.dataset.plumixMode = "edit";
    const strategy = vi.fn<IslandStrategy>((loadFn) => loadFn());
    stubStrategies(strategy);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "Search",
      opts: "{}",
      ssr: "",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(strategy).not.toHaveBeenCalled();
  });

  test("still hydrates in preview mode", async () => {
    document.documentElement.dataset.plumixMode = "preview";
    const strategy = vi.fn<IslandStrategy>();
    stubStrategies(strategy);
    const el = makeIsland({
      client: "load",
      "chunk-url": "/chunk.js",
      "component-export": "Search",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(strategy).toHaveBeenCalledTimes(1);
  });

  test("renders a labeled placeholder for a client-only island while editing", async () => {
    document.documentElement.dataset.plumixMode = "edit";
    stubStrategies();
    const el = makeIsland({
      client: "only",
      "chunk-url": "/chunk.js",
      "component-export": "Counter",
      opts: "{}",
    });
    document.body.appendChild(el);
    await Promise.resolve();
    expect(el.textContent).toContain("Client-only: Counter");
  });
});
