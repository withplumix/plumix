import type { PlumixEnv } from "./bindings.js";

/**
 * A config value that's either a literal `T`, or a resolver deriving it from the
 * runtime `env` at request time. The resolver form is required wherever the
 * value carries a secret that only exists per-request — notably Cloudflare
 * Workers, where secrets arrive via the `env` binding (not `process.env`) and
 * the config module is evaluated before any request. `env` is the augmentable
 * {@link PlumixEnv} (the cloudflare runtime extends it with `Cloudflare.Env`),
 * so a resolver reads bindings/secrets type-checked. Used by the secret-bearing
 * config slots — `mailer`, OAuth `clientSecret`, R2 S3 creds — all mirroring the
 * `libsql()` connection-config union.
 *
 * `T` must be a non-callable value: the literal-vs-resolver discriminator is
 * `typeof input === "function"`, which every current slot satisfies (each `T`
 * is an object).
 */
export type EnvInput<T> = T | ((env: PlumixEnv) => T);

// Memoize by resolver identity so a value that owns a connection (an SMTP
// transport, a pooled client) is built once per isolate, not per request —
// `env` is isolate-stable, the lazy-once contract `libsql()`'s client uses.
const cache = new WeakMap<(env: PlumixEnv) => unknown, unknown>();

export function resolveEnvInput<T>(input: EnvInput<T>, env: PlumixEnv): T {
  if (typeof input !== "function") return input;
  const resolver = input as (env: PlumixEnv) => T;
  if (!cache.has(resolver)) cache.set(resolver, resolver(env));
  return cache.get(resolver) as T;
}
