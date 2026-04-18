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
  requestStore,
} from "@plumix/core";

const notImplemented = (what: string) => () =>
  Promise.reject(
    new Error(`@plumix/runtime-cloudflare: ${what} is not yet implemented`),
  );

export function cloudflare(): RuntimeAdapter {
  return {
    name: "cloudflare",
    buildFetchHandler: buildFetch,
    cli: {
      dev: notImplemented("dev"),
      build: notImplemented("build"),
      deploy: notImplemented("deploy"),
      types: notImplemented("types"),
      migrate: notImplemented("migrate"),
    },
  };
}

function buildFetch(app: PlumixApp): FetchHandler {
  const dispatcher = createPlumixDispatcher(app);

  return async (request, env, executionCtx): Promise<Response> => {
    const workerCtx = executionCtx as ExecutionContext | undefined;
    const after =
      typeof workerCtx?.waitUntil === "function"
        ? (promise: Promise<unknown>) => workerCtx.waitUntil(promise)
        : undefined;

    try {
      const { db } = app.config.database.connect(env, request, app.schema);
      const appCtx = createAppContext({
        db: db as Db,
        env: env as PlumixEnv,
        request,
        hooks: app.hooks,
        plugins: app.plugins,
        after,
      });
      return await requestStore.run(appCtx, () => dispatcher(appCtx));
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
