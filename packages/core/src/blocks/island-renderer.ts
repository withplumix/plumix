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
  /**
   * The island's `id-prefix`: the server rendered it as its own root under this
   * `useId` prefix, so the client root takes the same one.
   */
  readonly identifierPrefix?: string;
}

export function mount(
  element: HTMLElement,
  options: MountOptions = {},
): IslandRoot {
  return mountWith({ createRoot, hydrateRoot }, element, options);
}

/** `mount` over the root functions it is given, so a unit test can double them. */
export function mountWith(
  roots: {
    readonly createRoot: typeof createRoot;
    readonly hydrateRoot: typeof hydrateRoot;
  },
  element: HTMLElement,
  options: MountOptions,
): IslandRoot {
  const { hydrate = true, identifierPrefix } = options;
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
      const kind = islandRootKind(Boolean(process.env.PLUMIX_DEV), hydrate);
      // The last moment the SSR HTML exists: on a mismatch React re-renders
      // the subtree in place.
      const server =
        process.env.PLUMIX_DEV && kind === "hydrate" ? element.innerHTML : "";
      const rootOptions = islandRootOptions(
        kind,
        identifierPrefix,
        element,
        server,
      );
      if (process.env.PLUMIX_DEV && kind === "hydrate") {
        // `hydrateRoot` renders `node` itself; there is no follow-up
        // `root.render`.
        root = roots.hydrateRoot(element, node, rootOptions);
        return;
      }
      root = roots.createRoot(element, rootOptions);
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

/**
 * React has already committed the recovered client render when this fires, so
 * `innerHTML` is the client side.
 */
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

/**
 * Dev hydrates a server-rendered island so a divergence reaches the overlay,
 * and a client-only one still reports its errors.
 */
export function islandRootKind(
  dev: boolean,
  hydrate: boolean,
): "hydrate" | "create-reporting" | "create" {
  if (!dev) return "create";
  return hydrate ? "hydrate" : "create-reporting";
}

/**
 * Every root takes the island's `id-prefix`. The inline `PLUMIX_DEV` at each
 * reporter is what folds: the dev handlers would otherwise ship to production.
 */
function islandRootOptions(
  kind: "hydrate" | "create-reporting" | "create",
  identifierPrefix: string | undefined,
  element: HTMLElement,
  server: string,
): {
  identifierPrefix?: string;
  onUncaughtError?: (error: unknown, info: ErrorInfo) => void;
  onRecoverableError?: (error: unknown, info: ErrorInfo) => void;
} {
  if (process.env.PLUMIX_DEV && kind === "hydrate") {
    return {
      identifierPrefix,
      onUncaughtError: reportIslandError(element),
      onRecoverableError: reportIslandMismatch(element, server),
    };
  }
  if (process.env.PLUMIX_DEV && kind === "create-reporting") {
    return { identifierPrefix, onUncaughtError: reportIslandError(element) };
  }
  return { identifierPrefix };
}

/** Each slot's raw HTML becomes a `<StaticHtml>` element on its named prop. */
export function mergeSlotProps(
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
