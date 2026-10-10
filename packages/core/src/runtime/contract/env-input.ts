import type { PlumixEnv } from "./bindings.js";

/**
 * The resolver form is needed where secrets arrive only via `env`, as on
 * Workers. `T` must not be callable: `typeof input === "function"` tells the
 * forms apart.
 */
export type EnvInput<T> = T | ((env: PlumixEnv) => T);

/**
 * By resolver identity, so a connection-owning value is built once per isolate.
 * `env` is isolate-stable, so the first resolution holds.
 */
const cache = new WeakMap<object, unknown>();

export function resolveEnvInput<T>(input: EnvInput<T>, env: PlumixEnv): T {
  if (typeof input !== "function") return input;
  const resolver = input as (env: PlumixEnv) => T;
  if (!cache.has(resolver)) cache.set(resolver, resolver(env));
  return cache.get(resolver) as T;
}
