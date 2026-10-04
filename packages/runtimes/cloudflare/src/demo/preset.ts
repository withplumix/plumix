import { auth } from "plumix/auth";

import type { TurnstileConfig } from "./turnstile.js";
import { cloudflare } from "../adapter.js";
import { readEnvString } from "../read-env.js";
import { demoAuthenticator } from "./authenticator.js";
import { demoDatabase } from "./database.js";
import { demoRuntime, PUBLIC_ORIGIN } from "./demo-runtime.js";

export interface DemoPresetConfig {
  /** DemoDB Durable Object namespace binding name (declared in wrangler). */
  readonly binding: string;
  /** Assembles the bootstrap SQL applied to a fresh session's DO. */
  readonly loadSql: () => Promise<string>;
  /** Optional Turnstile challenge gating session creation (bot mitigation). */
  readonly turnstile?: TurnstileConfig;
}

/**
 * The demo sandbox as a single opt-in. Spread into a config's top level to
 * swap in the per-session Durable Object database, the synthetic-admin
 * authenticator, and the demo runtime wrapper. All three move together so a
 * deploy can't half-configure the demo (e.g. fake admin without the DO).
 *
 * Real auth flows are blocked in demo mode and the authenticator owns who the
 * user is, so the passkey config is a placeholder — except its `origin`, which
 * is also the site origin every absolute URL (canonical, og:url) is built from.
 * It reads `PUBLIC_ORIGIN`, which the demo runtime fills with the request's own
 * origin when the deploy sets none.
 */
export function demoPreset(config: DemoPresetConfig) {
  const { binding, loadSql, turnstile } = config;
  return {
    runtime: demoRuntime(cloudflare(), { binding, loadSql, turnstile }),
    database: demoDatabase({ binding }),
    auth: auth({
      passkey: {
        rpName: "Plumix Demo",
        rpId: "demo.localhost",
        // Always set: the demo runtime fills it from the request when the
        // deploy doesn't.
        origin: (env) => readEnvString(env, PUBLIC_ORIGIN) ?? "",
      },
      authenticator: demoAuthenticator(),
    }),
  };
}
