// The SSR-time runtime the Vite `"use client"` transform delegates to.
// It owns the island boundary decision so that logic lives in real,
// testable code rather than a generated string.
//
// The boundary rule (see issue #1702): a `"use client"` component becomes
// an island when it carries an explicit hydration directive (`client=…`)
// OR it is the outermost such component in the render (no island
// ancestor). A non-directive `"use client"` component rendered *inside*
// an island renders inline — bundled into the parent island, its props
// never re-serialized. `InsideIslandContext` is the runtime signal a
// static per-module transform cannot compute at build time; it
// propagates through the SSR render tree exactly like any React context.
//
// Why this matters: shared design-system primitives (shadcn/Radix Tabs,
// etc.) ship `"use client"` per the RSC convention and thread React
// Context objects — which are genuinely cyclic — through their internals.
// Re-serializing every nested `"use client"` render walked into those
// cycles and threw `IslandPropSerializationError`. Serializing exactly
// once, at the outermost boundary, is what every RSC/islands framework
// (React, Astro, Nuxt) relies on.

import type { ComponentType, ReactElement, ReactNode } from "react";
import { createContext, createElement, useContext } from "react";

import type { SerializedProps } from "./serialize.js";
import { serializeProps } from "./serialize.js";

/**
 * Marks "we are already inside a hydrated island subtree". An island
 * provides `true` to the component it renders; nested shims read it to
 * decide inline-vs-island. Defaults to `false` so a top-level render is
 * treated as the outermost boundary.
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

// Deliberately broad: any object carrying a symbol `$$typeof` (elements,
// portals, lazy, …) — not React's narrower `isValidElement`. Everything it
// matches is bridged as a slot rather than serialized; anything it misses
// falls into `rest` and would hit the serializer. Mirrors the check the old
// generated shim used.
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

  // Shared client primitive rendered *within* an island (e.g. shadcn/Radix
  // Tabs inside an author's island): render inline, bundled into the parent
  // island. No new boundary, no prop serialization — the idempotent-boundary
  // rule that keeps Radix context internals away from the serializer.
  // `forwarded` drops the strategy props so they don't leak onto the DOM.
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
      // Children/slots are composed in the *outer* scope and passed in — they
      // belong to the enclosing boundary, not this island's bundle (the RSC
      // rule: passed children are bridged, never bundled). Reset the context
      // to `false` so a `"use client"` child becomes its own island and
      // hydrates, instead of inlining into frozen slot HTML.
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
