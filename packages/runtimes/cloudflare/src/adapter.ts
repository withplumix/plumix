import { AsyncLocalStorage } from "node:async_hooks";
import type {
  AssetsBinding,
  PlumixApp,
  PlumixEnv,
  PlumixHandler,
  RuntimeAdapter,
} from "plumix";
import { createPlumixHandler } from "plumix";

import { registerCloudflareErrorHints } from "./dev-hints.js";
import { PlumixRuntimeConfigError } from "./errors.js";

// Cloudflare Workers Assets exposes a Fetcher on env.ASSETS when the
// wrangler config declares `assets.binding: "ASSETS"`. Consumers using a
// different binding name here get no admin serving — the core dispatcher
// falls back to `admin-not-available` for /_plumix/admin/*. Convention
// over config; `ASSETS` is what `apps/demo/wrangler.jsonc` ships.
function readAssetsBinding(env: PlumixEnv): AssetsBinding | undefined {
  const candidate = (env as { readonly ASSETS?: unknown }).ASSETS;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "fetch" in candidate &&
    typeof candidate.fetch === "function"
  ) {
    return candidate as AssetsBinding;
  }
  return undefined;
}

/**
 * Build the Cloudflare runtime adapter.
 *
 * @remarks
 * Requires the `nodejs_compat` compatibility flag in `wrangler.toml` — Plumix's
 * request-scoped context is backed by `node:async_hooks.AsyncLocalStorage`.
 * Without the flag the bundle fails to load with a cryptic
 * `module not found: node:async_hooks` error at first request.
 *
 * @example
 * ```toml
 * # wrangler.toml
 * compatibility_flags = ["nodejs_compat"]
 * ```
 */
export function cloudflare(): RuntimeAdapter {
  return {
    name: "cloudflare",
    createHandler,
    commandsModule: "@plumix/runtime-cloudflare/commands",
  };
}

// The default handler is the whole adapter; Cloudflare adds only the read its
// platform can answer.
function createHandler(app: PlumixApp): PlumixHandler {
  // Defense in depth: the `node:async_hooks` import above already fails at
  // module-load time without `nodejs_compat`, but if the runtime ships a
  // stubbed symbol (some edge-runtime shims do) the cryptic error bubbles up
  // from the first AsyncLocalStorage.run() call. Fail fast with a useful hint.
  if (typeof AsyncLocalStorage !== "function") {
    throw PlumixRuntimeConfigError.asyncLocalStorageMissing();
  }

  // Mirrors core's own `PLUMIX_DEV` gate around `registerCoreErrorHints` —
  // Vite-substituted at bundle time, so this and `registerCloudflareErrorHints`
  // tree-shake out of a production build.
  if (process.env.PLUMIX_DEV) {
    registerCloudflareErrorHints(app.hooks);
  }

  return createPlumixHandler(app, { assets: readAssetsBinding });
}
