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
 * All three pieces move together so a deploy can't half-configure the demo.
 * The passkey `origin` is real: it reads `PUBLIC_ORIGIN` for absolute URLs.
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
