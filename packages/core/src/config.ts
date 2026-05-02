import type { PlumixAuthConfig } from "./auth/config.js";
import type { Mailer } from "./auth/mailer/types.js";
import type { PluginDescriptor } from "./plugin/define.js";
import type { RuntimeAdapter } from "./runtime/adapter.js";
import type {
  DatabaseAdapter,
  ImageDelivery,
  KV,
  ObjectStorage,
} from "./runtime/slots.js";

export interface Theme {
  readonly id: string;
}

// Heterogeneous arrays of plugins/adapters need the framework-side slot typed
// with `any` so each caller's concrete generic is accepted via bivariance.
/* eslint-disable @typescript-eslint/no-explicit-any */
export type AnyPluginDescriptor = PluginDescriptor<any>;
export type AnyDatabaseAdapter = DatabaseAdapter<any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface PlumixConfigInput {
  readonly runtime: RuntimeAdapter;
  readonly database: AnyDatabaseAdapter;
  readonly auth: PlumixAuthConfig;
  readonly storage?: ObjectStorage;
  readonly imageDelivery?: ImageDelivery;
  readonly kv?: KV;
  /**
   * Outbound email transport. Implementations conform to the `Mailer`
   * interface from `@plumix/core` — one method, swap in any provider
   * (Resend, Postmark, SES, SMTP). Shared by every feature that sends
   * mail (magic-link today; future invite-email, password-reset,
   * plugin-defined notifications), so plugin authors and operators
   * configure the transport once at the top level. `consoleMailer()`
   * is the dev default.
   */
  readonly mailer?: Mailer;
  readonly themes?: readonly Theme[];
  readonly plugins?: readonly AnyPluginDescriptor[];
}

export interface PlumixConfig {
  readonly runtime: RuntimeAdapter;
  readonly database: AnyDatabaseAdapter;
  readonly auth: PlumixAuthConfig;
  readonly storage?: ObjectStorage;
  readonly imageDelivery?: ImageDelivery;
  readonly kv?: KV;
  readonly mailer?: Mailer;
  readonly themes: readonly Theme[];
  readonly plugins: readonly AnyPluginDescriptor[];
}

export function plumix(config: PlumixConfigInput): PlumixConfig {
  // Cross-field invariant: features that require email (magic-link
  // today) need a configured mailer at the top level. Surface this at
  // app build time rather than letting it crash on the first request.
  if (config.auth.magicLink && !config.mailer) {
    throw new Error(
      "plumix(): `auth.magicLink` requires a top-level `mailer` " +
        "(use `consoleMailer()` for dev or pass your own `Mailer`).",
    );
  }
  return {
    runtime: config.runtime,
    database: config.database,
    auth: config.auth,
    storage: config.storage,
    imageDelivery: config.imageDelivery,
    kv: config.kv,
    mailer: config.mailer,
    themes: config.themes ?? [],
    plugins: config.plugins ?? [],
  };
}

export { plumix as defineConfig };
