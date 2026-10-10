// Port of Astro's `astro-island.ts`; see LICENSE.

import type { ComponentType } from "react";

import type { JsonObject } from "../json.js";
import type { IslandPageMode } from "./island-mode.js";
import type { IslandRoot, MountOptions } from "./island-renderer.js";
import type { SerializedProps } from "./serialize.js";
import { islandStrategy } from "./island-global.js";
import { clientOnlyPlaceholderLabel, shouldHydrate } from "./island-mode.js";
import { deserializeProps } from "./serialize.js";

// Type-only so this element chunk stays React-free; the renderer is fetched at
// runtime.
interface RendererModule {
  mount(element: HTMLElement, options?: MountOptions): IslandRoot;
}

/**
 * The returned teardown runs on disconnect, so an island removed before its
 * trigger fires doesn't leak the strategy's observer or listener.
 */
export type IslandStrategy = (
  loadFn: () => Promise<void>,
  opts: JsonObject,
  el: PlumixIslandElement,
) => void | (() => void) | Promise<void | (() => void)>;

declare global {
  interface Window {
    Plumix?: Readonly<Record<string, IslandStrategy>>;
  }
}

const RETRY_DELAY_MS = 1000;

// Prototype-pollution defense: `mod["__proto__"]` would resolve to
// `Object.prototype` and be mounted as the component.
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
  private component: ComponentType<SerializedProps> | null = null;
  private childObserver: MutationObserver | null = null;
  private parentObserver: MutationObserver | null = null;
  private prefetched = false;
  private strategyCleanups: (() => void)[] = [];

  attributeChangedCallback(
    _name: string,
    oldValue: string | null,
    newValue: string | null,
  ): void {
    // The spec also fires this at upgrade time; the first render belongs to
    // `hydrate()`.
    if (
      !this.hydrated ||
      !this.root ||
      !this.component ||
      oldValue === newValue
    ) {
      return;
    }
    // Slots are bridged once at hydrate, so a `props` change re-renders scalar
    // props only.
    this.root.render(this.component, readProps(this), {});
  }

  connectedCallback(): void {
    // Hydrating against half-streamed children would cause a hydration
    // mismatch.
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
    for (const cleanup of this.strategyCleanups) cleanup();
    this.strategyCleanups = [];
    // Listeners pair `plumix:unmount` with hydration, so a never-hydrated
    // island stays silent.
    if (this.hydrated) {
      // On `window` because the element is already detached; before unmount so
      // listeners can still read React state via refs.
      window.dispatchEvent(
        new CustomEvent<{ element: PlumixIslandElement }>("plumix:unmount", {
          detail: { element: this },
        }),
      );
      // A parent island's commit can be what detached us, and React will not
      // unmount a root synchronously inside another root's render. A
      // microtask runs once that commit returns.
      const root = this.root;
      queueMicrotask(() => root?.unmount());
      this.root = null;
      this.component = null;
    }
  }

  private async start(): Promise<void> {
    if (this.hydrated) return;
    // In edit mode the island stays static SSR output: selectable, never
    // interactive.
    const mode = readPageMode();
    if (!shouldHydrate(mode)) {
      if (this.getAttribute("client") === "only") this.renderEditPlaceholder();
      return;
    }
    // A parent render that swaps this subtree mid-hydration would leave a
    // dangling root, so wait for the ancestor.
    // From `parentElement`: every island carries `ssr`, so `this.closest` would
    // self-block forever.
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
    const prefetch = this.getAttribute("prefetch");
    const opts = parseJsonAttr(this.getAttribute("opts"));

    // Wired first so it fires no later than hydration.
    if (prefetch && shouldPrefetch(strategy, prefetch)) {
      const prefetchFn = islandStrategy(prefetch);
      if (prefetchFn) {
        const cleanup = await prefetchFn(
          () => Promise.resolve(this.prefetch()),
          opts,
          this,
        );
        if (typeof cleanup === "function") this.strategyCleanups.push(cleanup);
      }
    }

    const fn = islandStrategy(strategy);
    if (!fn) {
      // No registered strategy — the runtime entry script never loaded.
      // Surface the same hydration-error event so the page can react.
      this.dispatchHydrationError(new Error(`unknown strategy: ${strategy}`));
      return;
    }
    const cleanup = await fn(() => this.hydrate(), opts, this);
    if (typeof cleanup === "function") this.strategyCleanups.push(cleanup);
  }

  /**
   * Best-effort: a failed prefetch is swallowed; `hydrate()` owns the retry and
   * error event.
   */
  private prefetch(): void {
    if (this.hydrated || this.prefetched) return;
    this.prefetched = true;
    const chunkUrl = this.getAttribute("chunk-url");
    const exportName = this.getAttribute("component-export") ?? "default";
    if (!chunkUrl || FORBIDDEN_EXPORT_KEYS.has(exportName)) return;
    void dynamicImport(chunkUrl).catch(() => undefined);
    void loadRenderer().catch(() => undefined);
  }

  private async hydrate(): Promise<void> {
    if (this.hydrated) return;
    // A parent render may have detached us since the strategy fired, and
    // `createRoot` on a detached node throws.
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
    // A client-only island has no server output to hydrate. The renderer uses
    // `createRoot` in production either way.
    this.root = renderer.mount(this, {
      hydrate: this.getAttribute("client") !== "only",
    });
    this.root.render(Component, readProps(this), readSlotHtml(this));
    // Releases nested islands waiting on this one.
    this.removeAttribute("ssr");
  }

  private async loadComponent(
    chunkUrl: string,
    exportName: string,
  ): Promise<ComponentType<SerializedProps> | null> {
    try {
      const mod = await dynamicImport(chunkUrl);
      return mod[exportName] as ComponentType<SerializedProps>;
    } catch (err) {
      if (this.retried) {
        this.dispatchHydrationError(err);
        return null;
      }
      this.retried = true;
      await sleep(RETRY_DELAY_MS);
      try {
        const retryUrl = appendCacheBust(chunkUrl);
        const mod = await dynamicImport(retryUrl);
        return mod[exportName] as ComponentType<SerializedProps>;
      } catch (retryErr) {
        this.dispatchHydrationError(retryErr);
        return null;
      }
    }
  }

  /**
   * An empty client-only shell would be an invisible, unselectable box in the
   * editor canvas.
   */
  private renderEditPlaceholder(): void {
    if (this.childElementCount > 0 || this.textContent.trim()) return;
    this.textContent = clientOnlyPlaceholderLabel(
      this.getAttribute("component-export"),
    );
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

// A chunk's namespace object. Not JSON: its exports are live components and
// module bindings — nothing here knows what they are, only that they are read
// by name.
type ModuleNamespace = Readonly<Record<string, unknown>>;

// Swappable because unit tests have no real chunk URLs. The URL comes off the
// page at runtime, so Vite has nothing to analyze.
let dynamicImport: (url: string) => Promise<ModuleNamespace> = (url) =>
  import(/* @vite-ignore */ url);

export function setDynamicImport(
  fn: (url: string) => Promise<ModuleNamespace>,
): () => void {
  const prev = dynamicImport;
  dynamicImport = fn;
  return () => {
    dynamicImport = prev;
  };
}

// Resolved from Vite's manifest at SSR time like each island's `chunk-url`,
// never baked in at build time.
let rendererUrl: string | null = null;

export function setRendererUrl(url: string): void {
  rendererUrl = url;
}

// Memoized so islands share one fetch. A rejection is not cached, so a later
// island can retry after a deploy race.
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
    return readRenderer(await dynamicImport(url));
  } catch {
    await sleep(RETRY_DELAY_MS);
    return readRenderer(await dynamicImport(appendCacheBust(url)));
  }
}

// The chunk is built from our own entry, so `mount` is a fact of the build. A
// member added to `RendererModule` must be read here too.
function readRenderer(namespace: ModuleNamespace): RendererModule {
  return { mount: namespace.mount as RendererModule["mount"] };
}

// Test seam: a unit test has no renderer chunk URL to import, so it injects
// the (statically imported) renderer module directly. Mirrors
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

// The edit/preview render stamps `data-plumix-mode` on <html> (see
// render-template). Read it here without importing the editor or renderer.
function readPageMode(): IslandPageMode {
  const raw = document.documentElement.dataset.plumixMode;
  if (raw === "edit" || raw === "preview" || raw === "live") return raw;
  return null;
}

function appendCacheBust(url: string): string {
  return `${url}#plumix-retry=${Date.now()}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Prefetch only helps when it fires strictly before hydration.
function shouldPrefetch(hydrateWhen: string, prefetchWhen: string): boolean {
  if (hydrateWhen === "load" || hydrateWhen === "only") return false;
  return hydrateWhen !== prefetchWhen;
}

function parseJsonAttr(raw: string | null): JsonObject {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed !== null && typeof parsed === "object") {
      return parsed as JsonObject;
    }
    return {};
  } catch {
    return {};
  }
}

function readProps(el: HTMLElement): SerializedProps {
  const raw = el.getAttribute("props");
  if (!raw) return {};
  return deserializeProps(raw);
}

// The `closest` check stops a parent island claiming a nested island's slots.
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
 * Safe to call twice (e.g. on HMR); `customElements` would otherwise throw on
 * redefinition.
 */
export function registerIslandElement(): void {
  if (!customElements.get(ISLAND_TAG)) {
    customElements.define(ISLAND_TAG, PlumixIslandElement);
  }
}
