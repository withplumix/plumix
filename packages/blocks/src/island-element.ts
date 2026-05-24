// Port of Astro's `astro-island.ts` (Apache-2.0). The custom element
// reads its hydration target from attributes the SSR walker emitted:
// the chunk URL, the named export to mount, the strategy name, the
// strategy-specific opts JSON, and an optional `await-children` flag
// that gates hydration on `MutationObserver` until streamed children
// settle. Props live in a sibling `<script type="application/json">`
// rather than an attribute because attribute size limits in real
// browsers (~64 KB on some engines) would clip a large prop graph.
//
// On a failed chunk import, hydrate() retries once with a cache-bust
// hash (`#plumix-retry=<ts>`) — covers the deploy-during-page-load
// case where the SSR'd HTML references a chunk URL that no longer
// resolves. After the second failure the element dispatches a
// cancelable `plumix:hydration-error` CustomEvent on `window`: a
// theme can `preventDefault()` to swallow it or surface a user-
// visible error UI, but the framework never crashes the page.

import type { ComponentType } from "react";
import type { Root } from "react-dom/client";
import { createElement } from "react";
import { createRoot } from "react-dom/client";

import { deserializeProps } from "./serialize.js";

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
  private root: Root | null = null;
  private retried = false;
  private hydrated = false;
  private childObserver: MutationObserver | null = null;

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
    this.root?.unmount();
    this.root = null;
  }

  private async start(): Promise<void> {
    if (this.hydrated) return;
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
    const Component = await this.loadComponent(chunkUrl, exportName);
    if (!Component) return;
    const props = readProps(this);
    this.hydrated = true;
    this.root = createRoot(this);
    this.root.render(createElement(Component, props));
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
  // SSR emits `<script type="application/json" data-plumix-island-props>`
  // as a sibling of the island element. Known limitation: any DOM
  // rewriter that inserts a non-script element between the two (third-
  // party scripts, translate extensions, theme post-processors) breaks
  // the lookup and the React component mounts with `{}` props. A more
  // robust lookup keyed by an explicit `props-id` attribute is filed
  // for a follow-up — for the islands MVP, the positional sibling
  // pattern matches the contract the walker emits.
  const script = el.nextElementSibling;
  if (
    !(script instanceof HTMLScriptElement) ||
    script.getAttribute("data-plumix-island-props") === null
  ) {
    return {};
  }
  return deserializeProps(script.textContent || "{}");
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
