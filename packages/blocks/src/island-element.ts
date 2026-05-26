// Port of Astro's `astro-island.ts` (Apache-2.0). The custom element
// reads its hydration target from attributes the SSR walker emitted:
// the chunk URL, the named export to mount, the strategy name, the
// strategy-specific opts JSON, the serialized `props` payload, and an
// optional `await-children` flag that gates hydration on
// `MutationObserver` until streamed children settle.
//
// On a failed chunk import, hydrate() retries once with a cache-bust
// hash (`#plumix-retry=<ts>`) — covers the deploy-during-page-load
// case where the SSR'd HTML references a chunk URL that no longer
// resolves. After the second failure the element dispatches a
// cancelable `plumix:hydration-error` CustomEvent on `window`: a
// theme can `preventDefault()` to swallow it or surface a user-
// visible error UI, but the framework never crashes the page.

import type { ComponentType } from "react";

import type { IslandRoot } from "./island-renderer.js";
import { deserializeProps } from "./serialize.js";

// The renderer module (`island-renderer.ts`) carries all the React +
// ReactDOM + StaticHtml weight. It is imported only as a type here
// (erased at build) and fetched at runtime via `loadRenderer()` inside
// `hydrate()`, so this element chunk stays React-free.
interface RendererModule {
  mount(element: HTMLElement): IslandRoot;
}

export type IslandStrategy = (
  loadFn: () => Promise<void>,
  opts: Readonly<Record<string, unknown>>,
  el: PlumixIslandElement,
) => void | Promise<void>;

declare global {
  interface Window {
    Plumix?: Readonly<Record<string, IslandStrategy>>;
  }
}

const RETRY_DELAY_MS = 1000;

// Prototype-pollution defense: the element does `mod[exportName]` to
// resolve the component, and `mod["__proto__"]` would return
// `Object.prototype` which `createRoot(...).render(<Component />)`
// would happily then try to mount. Mirror's Astro's
// `FORBIDDEN_COMPONENT_EXPORT_KEYS` and the matching server-side
// guard in `packages/plumix/src/vite/island-transform.ts`.
const FORBIDDEN_EXPORT_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export class PlumixIslandElement extends HTMLElement {
  static readonly observedAttributes: readonly string[] = ["props"];

  private root: IslandRoot | null = null;
  private retried = false;
  private hydrated = false;
  private component: ComponentType<Readonly<Record<string, unknown>>> | null =
    null;
  private childObserver: MutationObserver | null = null;
  private parentObserver: MutationObserver | null = null;

  attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    // Spec fires this for every observed attribute already on the element
    // at upgrade time (oldValue=null). The first render is owned by
    // `start()` → `hydrate()`; skip until that completes. The root/
    // component nullability checks satisfy TS — they're true together
    // with `hydrated` by construction.
    if (
      !this.hydrated ||
      !this.root ||
      !this.component ||
      oldValue === newValue
    ) {
      return;
    }
    // Re-render through the renderer handle. Slot props are bridged once
    // at hydrate; a `props` change re-renders with scalar props only —
    // same surface as before the renderer split.
    this.root.render(this.component, readProps(this), {});
  }

  connectedCallback(): void {
    // If await-children is set, defer until the streaming SSR finishes
    // emitting children — Astro's same gate. Without it the element
    // would hydrate against half-rendered markup and React would warn
    // about a hydration mismatch.
    if (
      this.hasAttribute("await-children") &&
      !this.hasAttribute("ssr-complete")
    ) {
      this.childObserver = new MutationObserver(() => {
        if (this.hasAttribute("ssr-complete")) {
          this.childObserver?.disconnect();
          this.childObserver = null;
          void this.start();
        }
      });
      this.childObserver.observe(this, {
        attributes: true,
        attributeFilter: ["ssr-complete"],
      });
      return;
    }
    void this.start();
  }

  disconnectedCallback(): void {
    this.childObserver?.disconnect();
    this.childObserver = null;
    this.parentObserver?.disconnect();
    this.parentObserver = null;
    // Only signal unmount when there's something to unmount. A deferred
    // island that never hydrated (parent never cleared `ssr`, or
    // `await-children` never settled) shouldn't emit `plumix:unmount`
    // — listeners pair these with the hydration lifecycle.
    if (this.hydrated) {
      // Dispatch on `window` (not `this`) because the element is
      // already detached by the time `disconnectedCallback` fires — a
      // bubbling event has no parent chain to traverse. Matches the
      // `plumix:hydration-error` event surface. Fires BEFORE
      // `root.unmount()` so listeners can read React state via refs
      // before teardown.
      window.dispatchEvent(
        new CustomEvent<{ element: PlumixIslandElement }>("plumix:unmount", {
          detail: { element: this },
        }),
      );
      this.root?.unmount();
      this.root = null;
      this.component = null;
    }
  }

  private async start(): Promise<void> {
    if (this.hydrated) return;
    // Top-down hydration: a nested island must NOT hydrate until its
    // closest `<plumix-island>` ancestor has cleared its `ssr` marker.
    // Without this, a parent React render that swaps the child's
    // subtree mid-hydration leaves a dangling `createRoot` on a
    // detached node. Mirrors Astro's `closest('astro-island[ssr]')`
    // contract.
    //
    // Searching from `parentElement`, not `this` — the walker stamps
    // `ssr=""` on every island including this one, so a self-rooted
    // `closest` would match `this` and self-block forever.
    const blockingAncestor = this.parentElement?.closest(`${ISLAND_TAG}[ssr]`);
    if (blockingAncestor) {
      const observer = new MutationObserver(() => {
        if (!blockingAncestor.hasAttribute("ssr")) {
          observer.disconnect();
          this.parentObserver = null;
          void this.start();
        }
      });
      this.parentObserver = observer;
      observer.observe(blockingAncestor, {
        attributes: true,
        attributeFilter: ["ssr"],
      });
      return;
    }
    const strategy = this.getAttribute("client") ?? "load";
    const opts = parseJsonAttr(this.getAttribute("opts"));
    const strategies = window.Plumix;
    const fn = strategies?.[strategy];
    if (!fn) {
      // No registered strategy — the runtime entry script never loaded.
      // Surface the same hydration-error event so the page can react.
      this.dispatchHydrationError(new Error(`unknown strategy: ${strategy}`));
      return;
    }
    await fn(() => this.hydrate(), opts, this);
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    // Bail when the parent React render has unmounted us between the
    // strategy firing and the loadFn callback executing — `createRoot`
    // on a detached node throws, and hydrating something not in the
    // document is moot anyway. Mirrors Astro's `if (!isConnected)`
    // guard in `astro-island.ts`.
    if (!this.isConnected) return;
    const chunkUrl = this.getAttribute("chunk-url");
    const exportName = this.getAttribute("component-export") ?? "default";
    if (!chunkUrl) {
      this.dispatchHydrationError(new Error("missing chunk-url attribute"));
      return;
    }
    if (FORBIDDEN_EXPORT_KEYS.has(exportName)) {
      this.dispatchHydrationError(
        new Error(`forbidden component-export key: ${exportName}`),
      );
      return;
    }
    // Fetch the component chunk and the shared renderer chunk in
    // parallel — one round-trip on first hydration (Astro's pattern).
    const componentPromise = this.loadComponent(chunkUrl, exportName);
    const rendererPromise = loadRenderer();
    const Component = await componentPromise;
    if (!Component) {
      // Component import already dispatched its own error and we're
      // bailing — make sure the in-flight renderer fetch can't surface as
      // an unhandled rejection (both fail together on a broken deploy).
      void rendererPromise.catch(() => undefined);
      return;
    }
    let renderer: RendererModule;
    try {
      renderer = await rendererPromise;
    } catch (err) {
      this.dispatchHydrationError(err);
      return;
    }
    this.hydrated = true;
    this.component = Component;
    this.root = renderer.mount(this);
    this.root.render(Component, readProps(this), readSlotHtml(this));
    // Clearing the `ssr` attribute signals any nested island awaiting
    // this parent that it's safe to hydrate now. See the MutationObserver
    // in `start()` that watches the closest ancestor's `ssr` attribute.
    this.removeAttribute("ssr");
  }

  private async loadComponent(
    chunkUrl: string,
    exportName: string,
  ): Promise<ComponentType<Readonly<Record<string, unknown>>> | null> {
    try {
      const mod = (await dynamicImport(chunkUrl)) as Record<string, unknown>;
      return mod[exportName] as ComponentType<
        Readonly<Record<string, unknown>>
      >;
    } catch (err) {
      if (this.retried) {
        this.dispatchHydrationError(err);
        return null;
      }
      this.retried = true;
      await sleep(RETRY_DELAY_MS);
      try {
        const retryUrl = appendCacheBust(chunkUrl);
        const mod = (await dynamicImport(retryUrl)) as Record<string, unknown>;
        return mod[exportName] as ComponentType<
          Readonly<Record<string, unknown>>
        >;
      } catch (retryErr) {
        this.dispatchHydrationError(retryErr);
        return null;
      }
    }
  }

  private dispatchHydrationError(err: unknown): void {
    window.dispatchEvent(
      new CustomEvent("plumix:hydration-error", {
        detail: { error: err, element: this },
        cancelable: true,
      }),
    );
  }
}

// Test-injectable dynamic import. jsdom can't resolve real module URLs
// in unit tests; swapping this lets the retry-and-error paths be
// exercised without spinning up a bundler.
let dynamicImport: (url: string) => Promise<unknown> = (url) => import(url);

export function setDynamicImport(
  fn: (url: string) => Promise<unknown>,
): () => void {
  const prev = dynamicImport;
  dynamicImport = fn;
  return () => {
    dynamicImport = prev;
  };
}

// The shared renderer chunk's URL, threaded in at runtime by the islands
// bootstrap (`island-runtime.ts` reads it off the injected `<script>`'s
// `data-plumix-renderer-url`). Resolved from Vite's manifest at SSR time,
// the same path per-island `chunk-url`s take — never baked at build time.
let rendererUrl: string | null = null;

export function setRendererUrl(url: string): void {
  rendererUrl = url;
}

// Memoized so concurrent islands on one page share a single renderer
// fetch. The custom element calls this in parallel with its component
// chunk inside `hydrate()`. A rejection is NOT cached — the memo resets
// so a later island can retry after a transient failure (deploy race),
// matching `loadComponent`'s retry posture.
let rendererPromise: Promise<RendererModule> | null = null;
let loadRenderer: () => Promise<RendererModule> = () => {
  if (rendererUrl === null) {
    return Promise.reject(new Error("island renderer URL not set"));
  }
  rendererPromise ??= importRendererWithRetry(rendererUrl).catch(
    (err: unknown) => {
      rendererPromise = null;
      throw err;
    },
  );
  return rendererPromise;
};

// Same deploy-during-load defense as `loadComponent`: one retry with a
// cache-bust hash before giving up, since the renderer URL is resolved
// from the SSR manifest exactly like the per-island chunk URL.
async function importRendererWithRetry(url: string): Promise<RendererModule> {
  try {
    return (await dynamicImport(url)) as RendererModule;
  } catch {
    await sleep(RETRY_DELAY_MS);
    return (await dynamicImport(appendCacheBust(url))) as RendererModule;
  }
}

// Test seam: jsdom can't import a real renderer chunk URL, so unit tests
// inject the (statically imported) renderer module directly. Mirrors
// `setDynamicImport`.
export function setRendererImport(
  fn: () => Promise<RendererModule>,
): () => void {
  const prev = loadRenderer;
  loadRenderer = fn;
  return () => {
    loadRenderer = prev;
    rendererPromise = null;
  };
}

function appendCacheBust(url: string): string {
  return `${url}#plumix-retry=${Date.now()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonAttr(raw: string | null): Readonly<Record<string, unknown>> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as Readonly<Record<string, unknown>>;
    }
    return {};
  } catch {
    return {};
  }
}

function readProps(el: HTMLElement): Readonly<Record<string, unknown>> {
  const raw = el.getAttribute("props");
  if (!raw) return {};
  return deserializeProps(raw);
}

// React-element props (children + named slots) were wrapped in
// <plumix-static-slot> at SSR and listed by name on `slots=`. On
// hydrate, find each matching descendant and collect its SSR'd HTML as a
// raw string by slot name; the renderer chunk wraps each in <StaticHtml>
// (that's the React work, kept out of this chunk). The
// closest('plumix-island') === el guard filters nested-island slots so a
// parent doesn't claim a child's.
function readSlotHtml(el: PlumixIslandElement): Record<string, string> {
  const raw = el.getAttribute("slots");
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const name of raw.split(",")) {
    if (!name) continue;
    const slot = Array.from(
      el.querySelectorAll<HTMLElement>(
        `plumix-static-slot[data-plumix-slot="${name}"]`,
      ),
    ).find((node) => node.closest(ISLAND_TAG) === el);
    if (!slot) continue;
    out[name] = slot.innerHTML;
  }
  return out;
}

export const ISLAND_TAG = "plumix-island";

/**
 * Register the `<plumix-island>` custom element. Guarded so a second
 * call (e.g. HMR reload during dev) doesn't throw — `customElements`
 * rejects redefinition. The framework's runtime entry script calls
 * this once on first execution; theme code generally never imports it
 * directly.
 */
export function registerIslandElement(): void {
  if (!customElements.get(ISLAND_TAG)) {
    customElements.define(ISLAND_TAG, PlumixIslandElement);
  }
}
