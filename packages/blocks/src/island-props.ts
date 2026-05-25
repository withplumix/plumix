/**
 * Hydration strategies the islands runtime recognizes. New strategies
 * land alongside their runtime implementation; v0 ships `load`
 * (eager) and `visible` (IntersectionObserver-gated).
 */
export type PlumixStrategy = "load" | "visible";

/**
 * Props helper for components marked with `"use client";`. Two safety
 * properties:
 *
 * 1. **Function-typed properties are excluded.** Functions don't survive
 *    the SSR → hydration JSON round-trip — the SSR'd render gets the
 *    real callback, but the client receives `undefined` after the wrapper
 *    re-parses the `props=` attribute. Forcing authors to omit them at
 *    the type layer catches the silent drop at compile time.
 *
 * 2. **The `client` prop is reserved for hydration strategy.** The
 *    server-side shim strips this prop and uses its string value to
 *    select the strategy (`"load"`, `"visible"`). A consumer who used
 *    the same name for their own data would silently lose it. Reserving
 *    the slot via the type makes the conflict visible at compile time.
 *
 * Authors declare component props as:
 *
 * ```ts
 * "use client";
 * function MyWidget(props: IslandProps<{ label: string; size?: number }>) { ... }
 * ```
 */
export type IslandProps<T> = OmitFunctions<Omit<T, "client">> & {
  readonly client?: PlumixStrategy;
};

type OmitFunctions<T> = {
  [K in keyof T as T[K] extends ((...args: never[]) => unknown) | undefined
    ? never
    : K]: T[K];
};
