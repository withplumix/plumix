import type { AppRouter } from "./router.js";

// The core RPC namespaces (the top-level keys of `appRouter`) as a light,
// value-level set, so `buildApp` and plugin registration can reject plugin-id
// collisions without importing the heavy procedure graph `appRouter` pulls in.
// The `Record<keyof AppRouter, …>` source fails the build if it drifts from
// `appRouter`'s keys in either direction.
const NAMESPACE_FLAGS: Record<keyof AppRouter, true> = {
  auth: true,
  entry: true,
  term: true,
  user: true,
  lookup: true,
  search: true,
  settings: true,
};

export const CORE_RPC_NAMESPACES: ReadonlySet<string> = new Set(
  Object.keys(NAMESPACE_FLAGS),
);
