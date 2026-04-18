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

  return async (request, env, executionCtx): Promise<Response> => {
    const workerCtx = executionCtx as ExecutionContext | undefined;
    const after =
      typeof workerCtx?.waitUntil === "function"
        ? (promise: Promise<unknown>) => workerCtx.waitUntil(promise)
        : undefined;

    try {
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

      const appCtx = createAppContext({
        db: db as Db,
        env: env as PlumixEnv,
        request,
        hooks: app.hooks,
        plugins: app.plugins,
        after,
      });
      const response = await requestStore.run(appCtx, () => dispatcher(appCtx));
      return scoped ? scoped.commit(response) : response;
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
