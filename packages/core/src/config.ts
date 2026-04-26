import type { PlumixAuthConfig } from "./auth/config.js";
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
  readonly themes: readonly Theme[];
  readonly plugins: readonly AnyPluginDescriptor[];
}

export function plumix(config: PlumixConfigInput): PlumixConfig {
  return {
    runtime: config.runtime,
    database: config.database,
    auth: config.auth,
    storage: config.storage,
    imageDelivery: config.imageDelivery,
    kv: config.kv,
    themes: config.themes ?? [],
    plugins: config.plugins ?? [],
  };
}

export { plumix as defineConfig };
