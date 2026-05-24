import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { IslandStrategy } from "./island-element.js";
import {
  ISLAND_TAG,
  PlumixIslandElement,
  registerIslandElement,
  setDynamicImport,
} from "./island-element.js";

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

  // The sibling-script prop pipeline is covered end-to-end by the
  // Playwright e2e in `packages/e2e/tests/islands-mvp.spec.ts` (Phase G).
  // Verifying it here would mean flushing a React 19 concurrent commit
  // out of jsdom, which is more harness wiring than value at the unit
  // layer. The deserializer round-trip is in `serialize.test.ts`.
});
