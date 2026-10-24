import { AsyncLocalStorage } from "node:async_hooks";
import type { PlumixEnv } from "plumix";
import type {
  AssetsBinding,
  RuntimeAdapter,
  RuntimeHandlerSpec,
} from "plumix/runtime";

import { bindingErrorHint } from "./dev-hints.js";
import { generateEntry } from "./entry-codegen.js";
import { PlumixRuntimeConfigError } from "./errors.js";

/**
 * Convention over config: a binding not named `ASSETS` gets no admin serving.
 */
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
 * The default handler is the whole adapter; Cloudflare adds only the reads its
 * platform can answer.
 */
const handler: RuntimeHandlerSpec = {
  assets: readAssetsBinding,
  clientAddress: readClientAddress,
  prepare: () => {
    // Some edge-runtime shims stub the symbol, which would fail cryptically at
    // the first `run()`.
    if (typeof AsyncLocalStorage !== "function") {
      throw PlumixRuntimeConfigError.asyncLocalStorageMissing();
    }
  },
};

/**
 * @remarks
 * Requires the `nodejs_compat` compatibility flag; without it the bundle fails
 * at first request with `module not found: node:async_hooks`.
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
    handler,
    generateEntry,
    commandsModule: "@plumix/runtime-cloudflare/commands",
    // Vite substitutes `PLUMIX_DEV` at bundle time, so the hint tree-shakes
    // out of a production build.
    errorHints: process.env.PLUMIX_DEV ? [bindingErrorHint] : undefined,
  };
}

/**
 * The edge overwrites this header, so it wins over a caller-supplied address,
 * absent header included. `x-forwarded-for` is forgeable and never read.
 */
function readClientAddress(request: Request): string | undefined {
  return request.headers.get("cf-connecting-ip") ?? undefined;
}
