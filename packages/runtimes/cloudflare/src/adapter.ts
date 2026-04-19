import { AsyncLocalStorage } from "node:async_hooks";

import type {
  AssetsBinding,
  Db,
  FetchHandler,
  PlumixApp,
  PlumixEnv,
  RuntimeAdapter,
} from "@plumix/core";
import {
  createAppContext,
  createPlumixDispatcher,
  jsonResponse,
  readSessionCookie,
  requestStore,
} from "@plumix/core";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Structural check for the Worker ExecutionContext — we only use
 * `waitUntil`, so that's the only shape we verify. Prefer this to a
 * `as ExecutionContext | undefined` cast: casts silently accept anything,
 * the guard narrows safely and documents intent.
 */
function isExecutionContext(value: unknown): value is ExecutionContext {
  return (
    typeof value === "object" &&
    value !== null &&
    "waitUntil" in value &&
    typeof (value as { waitUntil: unknown }).waitUntil === "function"
  );
}

// Cloudflare Workers Assets exposes a Fetcher on env.ASSETS when the
// wrangler config declares `assets.binding: "ASSETS"`. Consumers using a
// different binding name here get no admin serving — the core dispatcher
// falls back to `admin-not-available` for /_plumix/admin/*. Convention
// over config; `ASSETS` is what `examples/minimal/wrangler.jsonc` ships.
function readAssetsBinding(env: unknown): AssetsBinding | undefined {
  if (typeof env !== "object" || env === null) return undefined;
  const candidate = (env as { readonly ASSETS?: unknown }).ASSETS;
  if (
    typeof candidate === "object" &&
    candidate !== null &&
    "fetch" in candidate &&
    typeof (candidate as { fetch: unknown }).fetch === "function"
  ) {
    return candidate as AssetsBinding;
  }
  return undefined;
}

/**
 * Walk the configured slot adapters for their declared `requiredBindings`
 * and assert every key is present on `env`. Called once per Worker isolate
 * — the result is memoised — so the check is effectively free after the
 * first request.
 *
 * Produces a single error listing every missing binding, which is far more
 * actionable than a 500 surfacing from the first query several hops deeper.
 */
function collectBindingsFrom(slot: unknown, into: string[]): void {
  if (slot === undefined || slot === null) return;
  const bindings = (slot as { readonly requiredBindings?: readonly string[] })
    .requiredBindings;
  if (bindings) into.push(...bindings);
}

/**
 * Thrown when the runtime adapter detects a missing env binding at boot.
 * Dedicated class so the request handler can surface the actionable
 * message in the response body, rather than swallowing it as a generic
 * "internal_error" 500 (the operator may not have wrangler tail open).
 *
 * Internal: consumers interact via the HTTP response body
 * (`{"error": "plumix_runtime_config_error", ...}`), not by catching the
 * class directly. Keeping it non-exported avoids adding a stable API
 * surface for something that's effectively implementation detail.
 */
class PlumixRuntimeConfigError extends Error {
  readonly code = "plumix_runtime_config_error";
  readonly missing: readonly string[];
  constructor(missing: readonly string[]) {
    super(
      `@plumix/runtime-cloudflare: missing required env bindings: ${missing.join(", ")}. Declare them in wrangler.toml and ensure the names match the adapter config.`,
    );
    this.name = "PlumixRuntimeConfigError";
    this.missing = missing;
  }
}

function validateBindings(app: PlumixApp, env: unknown): void {
  const required: string[] = [];
  const { database, kv, storage } = app.config;
  if (database.requiredBindings) required.push(...database.requiredBindings);
  // kv and storage slots are structurally simple today but may grow
  // requiredBindings later; walk them defensively. Cast is needed because
  // the public slot types don't yet declare the field.
  collectBindingsFrom(kv, required);
  collectBindingsFrom(storage, required);

  if (required.length === 0) return;
  // Defensive: if env isn't an object, every binding is "missing". This
  // only hits with malformed test inputs — the real CF runtime always
  // hands us a plain object — but produces a useful error instead of a
  // TypeError from property access on undefined.
  if (env == null || typeof env !== "object") {
    throw new PlumixRuntimeConfigError(required);
  }
  const envRecord = env as Record<string, unknown>;
  // `== null` catches both undefined and null — a binding explicitly set
  // to null (rare, but possible with a misconfigured wrangler.toml) is
  // just as broken as an unset one.
  const missing = required.filter((name) => envRecord[name] == null);
  if (missing.length > 0) {
    throw new PlumixRuntimeConfigError(missing);
  }
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
    buildFetchHandler: buildFetch,
    commandsModule: "@plumix/runtime-cloudflare/commands",
  };
}

function buildFetch(app: PlumixApp): FetchHandler {
  // Defense in depth: the `node:async_hooks` import above already fails at
  // module-load time without `nodejs_compat`, but if the runtime ships a
  // stubbed symbol (some edge-runtime shims do) the cryptic error bubbles up
  // from the first AsyncLocalStorage.run() call. Fail fast with a useful hint.
  if (typeof AsyncLocalStorage !== "function") {
    throw new Error(
      '@plumix/runtime-cloudflare requires AsyncLocalStorage. Add `compatibility_flags = ["nodejs_compat"]` to wrangler.toml.',
    );
  }

  const dispatcher = createPlumixDispatcher(app);
  let bindingsValidated = false;

  return async (request, env, executionCtx): Promise<Response> => {
    try {
      // Memoised binding check — runs once per Worker isolate. Surfaces
      // misconfigured deploys as a readable error instead of an opaque 500
      // from the first query N frames deeper.
      //
      // Safe to memo on first env: on CF Workers env is immutable per
      // isolate (bindings are set at deploy time, not per-request), so the
      // flag can never be stale for a changed env. Tests that want to re-
      // validate after a simulated env change should construct a fresh
      // fetch handler per scenario — which is what `invoke()` does.
      if (!bindingsValidated) {
        validateBindings(app, env);
        bindingsValidated = true;
      }

      const workerCtx = isExecutionContext(executionCtx)
        ? executionCtx
        : undefined;
      const after = workerCtx
        ? (promise: Promise<unknown>) => workerCtx.waitUntil(promise)
        : undefined;

      const { database } = app.config;
      const scoped = database.connectRequest?.({
        env,
        request,
        schema: app.schema,
        isAuthenticated: readSessionCookie(request) !== null,
        isWrite: !SAFE_METHODS.has(request.method.toUpperCase()),
      });
      const db = scoped
        ? scoped.db
        : database.connect(env, request, app.schema).db;
      // Unify the post-dispatch path so both scoped and non-scoped configs
      // run the same finalize step. Keeps future response-shaping logic
      // (e.g. request-id headers, timing) in one place.
      const finalize = scoped
        ? (response: Response) => scoped.commit(response)
        : (response: Response) => response;

      const appCtx = createAppContext({
        db: db as Db,
        env: env as PlumixEnv,
        request,
        hooks: app.hooks,
        plugins: app.plugins,
        after,
        assets: readAssetsBinding(env),
      });
      const response = await requestStore.run(appCtx, () => dispatcher(appCtx));
      return finalize(response);
    } catch (error) {
      return handleAdapterFailure(error);
    }
  };
}

function handleAdapterFailure(error: unknown): Response {
  if (typeof console !== "undefined") {
    console.error("[plumix/runtime-cloudflare] adapter_failure", error);
  }
  // Config errors (missing bindings) are deploy metadata, not user input —
  // surface them in the response body so an operator without wrangler tail
  // can diagnose the misconfiguration from HTTP alone.
  if (error instanceof PlumixRuntimeConfigError) {
    return jsonResponse(
      {
        error: error.code,
        message: error.message,
        missing: error.missing,
      },
      { status: 500 },
    );
  }
  return jsonResponse({ error: "internal_error" }, { status: 500 });
}
