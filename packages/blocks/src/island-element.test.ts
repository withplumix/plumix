import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { IslandStrategy } from "./island-element.js";
import {
  ISLAND_TAG,
  PlumixIslandElement,
  registerIslandElement,
  setDynamicImport,
} from "./island-element.js";
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

  beforeEach(() => {
    document.body.innerHTML = "";
    delete (window as { Plumix?: unknown }).Plumix;
    restoreImport = () => undefined;
  });

  afterEach(() => {
    restoreImport();
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
