// The React half of the islands runtime, split out of `island-element.ts`
// so the eager element chunk carries no React. The custom element
// dynamic-imports this module inside `hydrate()` (in parallel with the
// per-island component chunk), so React + ReactDOM + StaticHtml are
// fetched only when an island actually hydrates — never on a page whose
// islands all defer below the fold. Mirrors Astro's renderer chunk
// (`packages/integrations/react/src/client.ts`).

import type { ComponentType, ErrorInfo } from "react";
import type { Root } from "react-dom/client";
import { createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import { StaticHtml } from "./static-html.js";

type Props = Readonly<Record<string, unknown>>;

/**
 * Renderer-owned handle the custom element drives, replacing the bare
 * `Root` it held before the split. The element collects slot HTML as raw
 * strings; wrapping each in `<StaticHtml>` is React work, so it lives here.
 */
export interface IslandRoot {
  render(
    Component: ComponentType<Props>,
    props: Props,
    slotHtml: Readonly<Record<string, string>>,
  ): void;
  unmount(): void;
}

export interface MountOptions {
  /**
   * In dev, hydrate the SSR DOM on the first render (default) so a server/client
   * divergence surfaces as a {@link https://react.dev `hydrateRoot`}
   * `onRecoverableError` — dispatched as a `plumix:island-hydration-mismatch`
   * diagnostic (#1667). Pass `false` for a client-only island: it ships no
   * server output, so there is nothing to hydrate and it mounts fresh with
   * `createRoot`. Ignored in production, where every island mounts with
   * `createRoot` unchanged.
   */
  readonly hydrate?: boolean;
}

export function mount(
  element: HTMLElement,
  options: MountOptions = {},
): IslandRoot {
  const hydrate = options.hydrate ?? true;
  // Created lazily on the first `render`: `hydrateRoot` needs the initial React
  // node at hydration time, and a later `props`-attribute change must reconcile
  // as a plain re-render — never a re-hydration. A non-null `root` is that
  // one-time "already mounted" distinction.
  let root: Root | null = null;
  return {
    render(Component, props, slotHtml) {
      const node = createElement(Component, mergeSlotProps(props, slotHtml));
      if (root !== null) {
        root.render(node);
        return;
      }
      // In dev a hydrating island mounts with `hydrateRoot`, so React reconciles
      // the client render against the server DOM and reports a divergence via
      // `onRecoverableError` (it recovers by client-rendering — no crash). The
      // mismatch flows to the island overlay (#1603) as its own diagnostic;
      // `onUncaughtError` still forwards a component throw as before.
      // `process.env.PLUMIX_DEV` is Vite-substituted at bundle time — empty in a
      // production build — so this whole branch and `hydrateRoot` tree-shake out
      // and production keeps `createRoot`, byte-for-byte unchanged.
      if (process.env.PLUMIX_DEV && hydrate) {
        // Capture the island's server markup before `hydrateRoot` touches it —
        // on a mismatch React re-renders the subtree client-side in place, so
        // this is the only point the SSR HTML still exists to pair against the
        // recovered client HTML in the diagnostic (#1668).
        const server = element.innerHTML;
        // `hydrateRoot` renders `node` itself; there is no follow-up
        // `root.render`.
        root = hydrateRoot(element, node, {
          onUncaughtError: reportIslandError(element),
          onRecoverableError: reportIslandMismatch(element, server),
        });
        return;
      }
      // Production (both the `createRoot` default handling) and a dev client-only
      // island (no server output to hydrate, but still wired to the overlay).
      root = process.env.PLUMIX_DEV
        ? createRoot(element, { onUncaughtError: reportIslandError(element) })
        : createRoot(element);
      root.render(node);
    },
    unmount() {
      root?.unmount();
      root = null;
    },
  };
}

// Dev-only: surface a component throw (render / effect, not caught by a user
// error boundary) to the island error overlay (#1603) with React's component
// stack, then still log it. React unmounts only this root, so other islands and
// the rest of the page keep working.
function reportIslandError(
  element: HTMLElement,
): (error: unknown, info: ErrorInfo) => void {
  return (error, info) => {
    window.dispatchEvent(
      new CustomEvent("plumix:island-error", {
        detail: {
          error,
          componentStack: info.componentStack ?? undefined,
          element,
        },
      }),
    );
    console.error(error);
  };
}

// Dev-only: a server/client divergence made React recover (client-render the
// subtree — no crash) and fire one recoverable error. Surface it to the island
// overlay (#1603) as its own diagnostic, carrying React's component stack plus
// the captured server/client HTML pair the overlay diffs (#1668). The signal is
// the mismatch, not the error object, so the error is discarded. By the time
// this fires, React has already committed the recovered client render, so
// `element.innerHTML` reads the post-recovery markup.
function reportIslandMismatch(
  element: HTMLElement,
  server: string,
): (error: unknown, info: ErrorInfo) => void {
  return (_error, info) => {
    window.dispatchEvent(
      new CustomEvent("plumix:island-hydration-mismatch", {
        detail: {
          element,
          componentStack: info.componentStack ?? undefined,
          server,
          client: element.innerHTML,
        },
      }),
    );
  };
}

// Bridge each SSR'd slot's raw HTML back into a prop as a `<StaticHtml>`
// element. No-op (returns props as-is) when there are no slots, so the
// common island carries no extra allocation.
function mergeSlotProps(
  props: Props,
  slotHtml: Readonly<Record<string, string>>,
): Props {
  const names = Object.keys(slotHtml);
  if (names.length === 0) return props;
  const merged: Record<string, unknown> = { ...props };
  for (const name of names) {
    merged[name] = createElement(StaticHtml, {
      html: slotHtml[name] ?? "",
      slotName: name,
    });
  }
  return merged;
}
