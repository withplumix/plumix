// Split from the element chunk so React is fetched only when an island actually
// hydrates.

import type { ComponentType, ErrorInfo } from "react";
import type { Root } from "react-dom/client";
import { createElement } from "react";
import { createRoot, hydrateRoot } from "react-dom/client";

import type { SerializedProps } from "./serialize.js";
import { StaticHtml } from "./static-html.js";

/**
 * Takes slot HTML as raw strings, since wrapping them in `<StaticHtml>` is
 * React work.
 */
export interface IslandRoot {
  render(
    Component: ComponentType<SerializedProps>,
    props: SerializedProps,
    slotHtml: Readonly<Record<string, string>>,
  ): void;
  unmount(): void;
}

export interface MountOptions {
  /**
   * Dev only: hydrating surfaces a server/client divergence as
   * `plumix:island-hydration-mismatch`. Pass `false` for a client-only island,
   * which has no server output.
   */
  readonly hydrate?: boolean;
}

export function mount(
  element: HTMLElement,
  options: MountOptions = {},
): IslandRoot {
  const hydrate = options.hydrate ?? true;
  // Lazy: `hydrateRoot` needs the first node, and a later `props` change must
  // re-render, never re-hydrate.
  let root: Root | null = null;
  return {
    render(Component, props, slotHtml) {
      const node = createElement(Component, mergeSlotProps(props, slotHtml));
      if (root !== null) {
        root.render(node);
        return;
      }
      // Inline `PLUMIX_DEV` so `hydrateRoot` tree-shakes out of production
      // builds.
      if (process.env.PLUMIX_DEV && hydrate) {
        // The last moment the SSR HTML exists: on a mismatch React re-renders
        // the subtree in place.
        const server = element.innerHTML;
        // `hydrateRoot` renders `node` itself; there is no follow-up
        // `root.render`.
        root = hydrateRoot(element, node, {
          onUncaughtError: reportIslandError(element),
          onRecoverableError: reportIslandMismatch(element, server),
        });
        return;
      }
      // Production (both the `createRoot` default handling) and a dev
      // client-only island (no server output to hydrate, but still wired to the
      // overlay).
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

// React has already committed the recovered client render when this fires, so
// `innerHTML` is the client side.
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

function mergeSlotProps(
  props: SerializedProps,
  slotHtml: Readonly<Record<string, string>>,
): SerializedProps {
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
