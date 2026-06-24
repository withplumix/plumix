import type { PlumixEnv } from "../../runtime/bindings.js";
import type { Mailer } from "./types.js";

/**
 * The mailer config slot: either a literal {@link Mailer}, or a resolver that
 * derives one from the runtime `env` at request time. The resolver form is
 * required wherever the transport's secret only exists per-request — notably
 * Cloudflare Workers, where the API key arrives via the `env` binding (not
 * `process.env`) and the config module is evaluated before any request. The
 * literal form fits Node/Docker, where the key is known at config time. Mirrors
 * the `libsql()` connection-config union.
 *
 * `env` is the type-checked {@link PlumixEnv} — the cloudflare runtime augments
 * it with the wrangler-generated `Cloudflare.Env`, so `(env) => …` reads bindings
 * and secrets with full type-safety (no cast) once the user has run
 * `wrangler types`.
 */
export type MailerInput = Mailer | ((env: PlumixEnv) => Mailer);

// Memoize by resolver identity so a transport that owns a connection (SMTP, a
// pooled client) is built once per isolate, not per request — `env` is
// isolate-stable, the same lazy-once contract as `libsql()`'s client.
const resolved = new WeakMap<(env: PlumixEnv) => Mailer, Mailer>();

export function resolveMailer(
  input: MailerInput | undefined,
  env: PlumixEnv,
): Mailer | undefined {
  if (typeof input !== "function") return input;
  let mailer = resolved.get(input);
  if (!mailer) {
    mailer = input(env);
    resolved.set(input, mailer);
  }
  return mailer;
}
