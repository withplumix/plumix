/**
 * Hydration strategies the islands runtime recognizes. Each lands
 * alongside its runtime implementation in `island-strategies/`:
 *
 * - `load` — hydrate eagerly on connect.
 * - `idle` — hydrate in a `requestIdleCallback` slot (capped fallback).
 * - `visible` — hydrate when the island scrolls into view.
 * - `interaction` — hydrate on first user intent, then replay the
 *   triggering event so the first click/keypress isn't lost.
 * - `only` — no SSR markup; render client-side on connect.
 */
export type PlumixStrategy =
  "load" | "idle" | "visible" | "interaction" | "only";

/**
 * The subset of strategies valid as a *prefetch* trigger. Prefetch warms
 * the chunk over the network ahead of hydration, so it only makes sense for
 * triggers that fire on their own (no user intent) and never later than the
 * hydration trigger: `load`, `idle`, `visible`. Prefetching "on
 * interaction" is meaningless — the chunk would arrive after the click it
 * was meant to make instant — so `interaction`/`only` are excluded at the
 * type layer.
 */
export type PlumixPrefetch = "load" | "idle" | "visible";

/**
 * Props helper for components marked with `"use client";`. Three safety
 * properties:
 *
 * 1. **Function-typed properties are excluded.** Functions don't survive
 *    the SSR → hydration JSON round-trip — the SSR'd render gets the
 *    real callback, but the client receives `undefined` after the wrapper
 *    re-parses the `props=` attribute. Forcing authors to omit them at
 *    the type layer catches the silent drop at compile time.
 *
 * 2. **The `client` prop is reserved for the hydration strategy.** The
 *    server-side shim strips this prop and uses its value to select the
 *    strategy. A consumer who used the same name for their own data would
 *    silently lose it; reserving the slot makes the conflict a compile
 *    error.
 *
 * 3. **The `prefetch` prop is reserved for the prefetch trigger.** Splits
 *    *when the chunk downloads* from *when the island hydrates* — the
 *    plumix-specific lever Astro/Nuxt lack. Defaults are derived from
 *    `client` (see the SSR shim), so authors only set this to override.
 *
 * Authors declare component props as:
 *
 * ```ts
 * "use client";
 * function MyWidget(props: IslandProps<{ label: string; size?: number }>) { ... }
 * ```
 */
export type IslandProps<T> = OmitFunctions<Omit<T, "client" | "prefetch">> & {
  readonly client?: PlumixStrategy;
  readonly prefetch?: PlumixPrefetch;
};

type OmitFunctions<T> = {
  [
    K in keyof T as T[K] extends ((...args: never[]) => unknown) | undefined
      ? never
      : K
  ]: T[K];
};
