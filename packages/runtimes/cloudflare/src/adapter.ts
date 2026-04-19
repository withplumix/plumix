import { AsyncLocalStorage } from "node:async_hooks";

import type {
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
  const envRecord = env as Record<string, unknown>;
  const missing = required.filter((name) => envRecord[name] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `@plumix/runtime-cloudflare: missing required env bindings: ${missing.join(", ")}. Declare them in wrangler.toml and ensure the names match the adapter config.`,
    );
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
  return jsonResponse({ error: "internal_error" }, { status: 500 });
}
