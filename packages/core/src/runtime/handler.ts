import type { AppContext, Db } from "../context/app.js";
import type { Invocation, PlumixHandler, ScheduledEvent } from "./adapter.js";
import type { PlumixApp } from "./app.js";
import type { PlumixEnv } from "./bindings.js";
import type {
  AssetsBinding,
  RequestScopedDb,
  RequestScopedDbArgs,
} from "./slots.js";
import { readSessionCookie } from "../auth/cookies.js";
import { isSafeMethod } from "../auth/csrf.js";
import { createAppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { createPlumixDispatcher } from "./dispatcher.js";
import { resolveEnvInput } from "./env-input.js";
import { RuntimeConfigError } from "./errors.js";
import { jsonResponse } from "./http.js";
import { runScheduledTasks } from "./scheduled.js";

export interface PlumixHandlerOptions {
  /**
   * Resolve the static-asset fetcher for an invocation. Only a runtime knows
   * where its assets live; without one the admin SPA answers
   * `admin-not-available`.
   */
  readonly assets?: (env: PlumixEnv) => AssetsBinding | undefined;
}

/**
 * The default handler factory. An adapter wraps it and adds only the reads
 * its platform can answer.
 */
export function createPlumixHandler(
  app: PlumixApp,
  options: PlumixHandlerOptions = {},
): PlumixHandler {
  const dispatcher = createPlumixDispatcher(app);
  // Once per handler, not per request: an env is fixed for the handler's
  // lifetime on every runtime this factory serves, so the first verdict holds.
  let bindingsValidated = false;
  const validateOnce = (env: PlumixEnv): void => {
    if (bindingsValidated) return;
    validateBindings(app, env);
    bindingsValidated = true;
  };

  return {
    fetch: async (request, invocation) => {
      try {
        validateOnce(invocation.env);
        const scoped = connectDatabase(app, {
          env: invocation.env,
          request,
          isAuthenticated: readSessionCookie(request) !== null,
          isWrite: !isSafeMethod(request.method),
        });
        const ctx = buildAppContext(
          app,
          options,
          invocation,
          request,
          scoped.db,
        );
        const response = await requestStore.run(ctx, () => dispatcher(ctx));
        return scoped.commit(response);
      } catch (error) {
        return handleFailure(error);
      }
    },

    scheduled: async (event, invocation) => {
      validateOnce(invocation.env);
      const request = syntheticScheduledRequest(app, invocation.env, event);
      // A scheduled run always writes (purges mutate state), so deploys that
      // route writes to a primary do so for scheduled work too.
      const scoped = connectDatabase(app, {
        env: invocation.env,
        request,
        isAuthenticated: false,
        isWrite: true,
      });
      const ctx = buildAppContext(app, options, invocation, request, scoped.db);
      try {
        await requestStore.run(ctx, () =>
          runScheduledTasks(app, ctx, event.cron),
        );
        // The response `commit` decorates has no reader on the cron path.
        scoped.commit(new Response(null));
      } catch (error) {
        console.error("[plumix] scheduled_failure", error);
      }
    },
  };
}

// Scheduled tasks reading `ctx.request.url` see an internal marker, not an
// inbound request.
function syntheticScheduledRequest(
  app: PlumixApp,
  env: PlumixEnv,
  event: ScheduledEvent,
): Request {
  const origin = resolveEnvInput(app.origin, env);
  return new Request(
    `${origin}/_plumix/internal/scheduled?cron=${encodeURIComponent(event.cron)}`,
    { method: "POST" },
  );
}

function connectDatabase(
  app: PlumixApp,
  args: Omit<RequestScopedDbArgs, "schema">,
): RequestScopedDb {
  const { database } = app.config;
  const scoped = database.connectRequest?.({ ...args, schema: app.schema });
  if (scoped) return scoped;
  return {
    db: database.connect(args.env, args.request, app.schema).db,
    commit: (response) => response,
  };
}

function buildAppContext(
  app: PlumixApp,
  options: PlumixHandlerOptions,
  invocation: Invocation,
  request: Request,
  db: unknown,
): AppContext {
  const { env, waitUntil } = invocation;
  // `cache` connects to null when the deploy cannot purge; null → undefined
  // turns caching off and pages render live.
  const cache = app.config.cache?.connect(env) ?? undefined;
  return createAppContext({
    db: db as Db,
    env,
    request,
    hooks: app.hooks,
    plugins: app.plugins,
    blocks: app.blocks,
    marks: app.marks,
    shortcodes: app.shortcodes,
    defer: waitUntil,
    assets: options.assets?.(env),
    storage: app.config.storage?.connect(env),
    cache,
    kv: app.config.kv?.connect(env),
    imageDelivery: connectImageDelivery(app, env),
    imageRemotePatterns: app.config.images?.remotePatterns,
    debugBar: app.config.debugBar,
    telemetry: app.config.telemetry,
    mailer: app.config.mailer,
    i18n: app.config.i18n,
    oauthProviders: app.oauthProviders,
    authMethods: app.authMethods,
    authenticator: app.authenticator,
    bootstrapAllowed: app.bootstrapAllowed,
    origin: app.origin,
    basePath: app.basePath,
    siteName: app.config.auth.magicLink?.siteName,
    appContextExtensions: app.appContextExtensions,
  });
}

// `connect` owns its result, including `undefined` for "no delivery" — so it
// must not `?? slot` back to the bare (identity-transform) object.
function connectImageDelivery(
  app: PlumixApp,
  env: PlumixEnv,
): PlumixApp["config"]["imageDelivery"] {
  const slot = app.config.imageDelivery;
  if (!slot) return undefined;
  return slot.connect ? slot.connect(env) : slot;
}

// One error lists every missing binding, which beats a 500 surfacing from the
// first query several hops deeper.
function validateBindings(app: PlumixApp, env: PlumixEnv): void {
  const { database, storage, kv } = app.config;
  const required: string[] = [];
  for (const slot of [database, storage, kv]) {
    if (slot?.requiredBindings) required.push(...slot.requiredBindings);
  }
  if (required.length === 0) return;
  // The bindings are read by the names the slots declared, not by any key the
  // `PlumixEnv` augmentation knows; a malformed caller may hand in no bag at
  // all, and a null-valued binding is as broken as an unset one.
  const bag = env as Readonly<Record<string, unknown>> | undefined;
  const missing = required.filter((name) => bag?.[name] == null);
  if (missing.length > 0) {
    throw RuntimeConfigError.bindingsMissing({ missing });
  }
}

function handleFailure(error: unknown): Response {
  console.error("[plumix] handler_failure", error);
  // Config errors are deploy metadata, not user input: surface them in the
  // body so an operator without a log tail can diagnose from HTTP alone.
  if (error instanceof RuntimeConfigError) {
    return jsonResponse(
      { error: error.code, message: error.message, missing: error.missing },
      { status: 500 },
    );
  }
  return jsonResponse({ error: "internal_error" }, { status: 500 });
}
