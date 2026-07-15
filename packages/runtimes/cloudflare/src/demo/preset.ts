import { auth } from "plumix";

import { cloudflare } from "../adapter.js";
import { demoAuthenticator } from "./authenticator.js";
import { demoDatabase } from "./database.js";
import { demoRuntime } from "./demo-runtime.js";

export interface DemoPresetConfig {
  /** DemoDB Durable Object namespace binding name (declared in wrangler). */
  readonly binding: string;
  /** Assembles the bootstrap SQL applied to a fresh session's DO. */
  readonly loadSql: () => Promise<string>;
}

/**
 * The demo sandbox as a single opt-in. Spread into a config's top level to
 * swap in the per-session Durable Object database, the synthetic-admin
 * authenticator, and the demo runtime wrapper. All three move together so a
 * deploy can't half-configure the demo (e.g. fake admin without the DO).
 *
 * The passkey config is a required-but-unused placeholder: real auth flows are
 * blocked in demo mode, and the authenticator owns who the user is.
 */
export function demoPreset(config: DemoPresetConfig) {
  const { binding, loadSql } = config;
  return {
    runtime: demoRuntime(cloudflare(), { binding, loadSql }),
    database: demoDatabase({ binding }),
    auth: auth({
      passkey: {
        rpName: "Plumix Demo",
        rpId: "demo.localhost",
        origin: "https://demo.localhost",
      },
      authenticator: demoAuthenticator(),
    }),
  };
}
