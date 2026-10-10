// Props serialize only at the outermost `"use client"` boundary: shared
// primitives like Radix thread cyclic React contexts through nested client
// components.

import type { ComponentType, ReactElement, ReactNode } from "react";
import { createContext, createElement, useContext } from "react";

import type { SerializedProps } from "./serialize.js";
import { serializeProps } from "./serialize.js";

/**
 * `true` inside a hydrated island subtree, where a directive-less client
 * component renders inline.
 */
export const InsideIslandContext = createContext(false);

// Default prefetch trigger per hydration trigger — the chunk warms before
// the user reaches the island. Mirrors the table the transform used to
// bake into every shim.
const PREFETCH_DEFAULTS: Readonly<Record<string, string>> = {
  load: "load",
  idle: "load",
  visible: "visible",
  interaction: "visible",
  only: "load",
};

export interface IslandShimProps {
  /** The original (untransformed) island component. */
  readonly Component: ComponentType<SerializedProps>;
  /** The named export, echoed onto `component-export` for client mount. */
  readonly exportName: string;
  /** Hashed chunk URL the custom element dynamic-imports on hydrate. */
  readonly chunkUrl: string;
  /** The raw props the author passed to the island component. */
  readonly props: SerializedProps;
}

// Broader than `isValidElement` on purpose: portals and lazy must be bridged as
// slots, not serialized.
function isReactElementValue(value: unknown): value is ReactElement {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as { $$typeof?: unknown }).$$typeof === "symbol"
  );
}

export function IslandShim(shim: IslandShimProps): ReactNode {
  const { Component, exportName, chunkUrl, props } = shim;
  const insideIsland = useContext(InsideIslandContext);
  const { client: rawClient, prefetch, ...forwarded } = props;
  const client = typeof rawClient === "string" ? rawClient : undefined;
  const hasDirective = client !== undefined;

  if (insideIsland && !hasDirective) {
    return createElement(Component, forwarded);
  }

  // `wrapped` is the full prop set fed to the SSR'd component (React-element
  // props replaced by <plumix-static-slot> wrappers). `rest` is the
  // JSON-safe subset for the serialized `props=` attribute.
  const rest: Record<string, unknown> = {};
  const wrapped: Record<string, unknown> = {};
  const slots: string[] = [];
  for (const [key, value] of Object.entries(forwarded)) {
    if (isReactElementValue(value)) {
      slots.push(key);
      // Passed children belong to the outer scope, so a client child must
      // become its own island, not frozen slot HTML.
      wrapped[key] = createElement(
        "plumix-static-slot",
        { "data-plumix-slot": key },
        createElement(InsideIslandContext.Provider, { value: false }, value),
      );
    } else {
      rest[key] = value;
      wrapped[key] = value;
    }
  }

  const when = client ?? "interaction";
  const pf =
    typeof prefetch === "string"
      ? prefetch
      : (PREFETCH_DEFAULTS[when] ?? "load");
  // `only` skips SSR entirely: empty shell, no `ssr` gate, the client
  // renders into it on connect.
  const only = when === "only";

  // The displayName gives the cycle detector something to attribute — a
  // genuinely cyclic author prop now names the offending island.
  const serialized = serializeProps(rest, { displayName: exportName });

  const child = only
    ? null
    : createElement(
        InsideIslandContext.Provider,
        { value: true },
        createElement(Component, wrapped),
      );

  return createElement(
    "plumix-island",
    {
      "chunk-url": chunkUrl,
      "component-export": exportName,
      client: when,
      prefetch: pf,
      props: serialized,
      slots: slots.length ? slots.join(",") : null,
      ssr: only ? null : "",
    },
    child,
  );
}
