// Config-facing demo API. Must stay free of `cloudflare:workers` imports so it
// loads under jiti (config codegen). The DemoDB Durable Object class lives on
// the `./demo/durable-object` subpath instead.
export { DEMO_ADMIN, demoAuthenticator } from "./authenticator.js";
export { demoDatabase } from "./database.js";
export type { DemoDatabaseConfig } from "./database.js";
export { demoRuntime } from "./demo-runtime.js";
export type { DemoRuntimeConfig } from "./demo-runtime.js";
export { demoPreset } from "./preset.js";
export type { DemoPresetConfig } from "./preset.js";
export type { DemoSqlExecutor } from "./storage.js";
