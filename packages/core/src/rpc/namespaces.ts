import type { AppRouter } from "./router.js";

/**
 * A value-level copy of `appRouter`'s keys, so plugin-id collision checks
 * don't import the heavy procedure graph. The `Record<keyof AppRouter, …>`
 * type fails the build on drift.
 */
const NAMESPACE_FLAGS: Record<keyof AppRouter, true> = {
  auth: true,
  entry: true,
  term: true,
  user: true,
  lookup: true,
  meta: true,
  search: true,
  settings: true,
};

export const CORE_RPC_NAMESPACES: ReadonlySet<string> = new Set(
  Object.keys(NAMESPACE_FLAGS),
);
