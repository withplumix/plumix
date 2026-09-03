import type { AppContext, Db, DeferFn } from "../context/app.js";
import type { Invocation, PlumixHandler, ScheduledEvent } from "./adapter.js";
import type { PlumixApp } from "./app.js";
import type { PlumixEnv } from "./bindings.js";
import type {
  AssetsBinding,
  ConnectedCache,
  ConnectedKv,
  ConnectedObjectStorage,
  DatabaseAdapter,
  ImageDelivery,
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
  /**
   * How long `dispose()` waits for tracked deferred work before giving up, so
   * a shutdown cannot be held open by a task that never settles. Defaults to
   * five seconds.
   */
  readonly disposeTimeoutMs?: number;
}

const DEFAULT_DISPOSE_TIMEOUT_MS = 5_000;

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
  // lifetime on every runtime this factory serves, so the first verdict — and
  // the first bind below — holds.
  let bindingsValidated = false;
  const validateOnce = (env: PlumixEnv): void => {
    if (bindingsValidated) return;
    validateBindings(app, env);
    bindingsValidated = true;
  };

  // Fire-and-forget work no invocation could hand to a `waitUntil`.
  const pending = new Set<Promise<unknown>>();
  const track: DeferFn = (promise) => {
    pending.add(promise);
    const forget = (): void => void pending.delete(promise);
    void promise.then(forget, forget);
  };

  let slots: BoundSlots | undefined;
  const bindOnce = (env: PlumixEnv): BoundSlots =>
    (slots ??= bindSlots(app, env));

  // Kept out of `bindSlots` because binding it eagerly would build a client
  // for an adapter whose `connectRequest` answers every request.
  let boundDb: ReturnType<DatabaseAdapter["connect"]> | undefined;
  // `connectRequest` is the only per-request database seam; `connect` binds
  // once and is reused when there is no hook or the hook declines.
  const connectDatabase = (
    args: Omit<RequestScopedDbArgs, "schema">,
  ): RequestScopedDb => {
    const { database } = app.config;
    const scoped = database.connectRequest?.({ ...args, schema: app.schema });
    if (scoped) return scoped;
    boundDb ??= database.connect(args.env, args.request, app.schema);
    return { db: boundDb.db, commit: (response) => response };
  };

  return {
    fetch: async (request, invocation) => {
      try {
        validateOnce(invocation.env);
        const scoped = connectDatabase({
          env: invocation.env,
          request,
          isAuthenticated: readSessionCookie(request) !== null,
          isWrite: !isSafeMethod(request.method),
        });
        const ctx = buildAppContext({
          app,
          options,
          invocation,
          request,
          db: scoped.db,
          defer: invocation.waitUntil ?? track,
          slots: bindOnce(invocation.env),
        });
        const response = await requestStore.run(ctx, () => dispatcher(ctx));
        return scoped.commit(response);
      } catch (error) {
        return handleFailure(error);
      }
    },

    dispose: async () => {
      const timeoutMs = options.disposeTimeoutMs ?? DEFAULT_DISPOSE_TIMEOUT_MS;
      const deadline = Date.now() + timeoutMs;
      // Deferred work defers more work — a telemetry consumer purging a tag,
      // say — so the drain follows what lands mid-drain. The deadline is
      // absolute, so a chain of quick tasks cannot extend a shutdown at will.
      while (pending.size > 0 && Date.now() < deadline) {
        await settleWithin([...pending], deadline - Date.now());
      }
      if (pending.size === 0) return;
      console.warn(
        `[plumix] deferred_work_abandoned: ${pending.size} deferred task(s) still running after ${timeoutMs}ms`,
      );
    },

    scheduled: async (event, invocation) => {
      validateOnce(invocation.env);
      const request = syntheticScheduledRequest(app, invocation.env, event);
      try {
        // A scheduled run always writes (purges mutate state), so deploys that
        // route writes to a primary do so for scheduled work too.
        const scoped = connectDatabase({
          env: invocation.env,
          request,
          isAuthenticated: false,
          isWrite: true,
        });
        const ctx = buildAppContext({
          app,
          options,
          invocation,
          request,
          db: scoped.db,
          defer: invocation.waitUntil ?? track,
          slots: bindOnce(invocation.env),
        });
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

/** Waits for `work` to settle, returning early once `timeoutMs` has passed. */
async function settleWithin(
  work: readonly Promise<unknown>[],
  timeoutMs: number,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.allSettled(work),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } finally {
    // A live timer would keep a process runtime's event loop open past the
    // shutdown this drain exists to serve.
    clearTimeout(timer);
  }
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

/** The env-derived slots, bound once for the handler's life. */
interface BoundSlots {
  readonly storage: ConnectedObjectStorage | undefined;
  readonly cache: ConnectedCache | undefined;
  readonly kv: ConnectedKv | undefined;
  readonly imageDelivery: ImageDelivery | undefined;
}

function bindSlots(app: PlumixApp, env: PlumixEnv): BoundSlots {
  return {
    storage: app.config.storage?.connect(env),
    // `cache` connects to null when the deploy cannot purge; null → undefined
    // turns caching off and pages render live.
    cache: app.config.cache?.connect(env) ?? undefined,
    kv: app.config.kv?.connect(env),
    imageDelivery: connectImageDelivery(app, env),
  };
}

interface AppContextArgs {
  readonly app: PlumixApp;
  readonly options: PlumixHandlerOptions;
  readonly invocation: Invocation;
  readonly request: Request;
  readonly db: unknown;
  readonly defer: DeferFn;
  readonly slots: BoundSlots;
}

function buildAppContext({
  app,
  options,
  invocation,
  request,
  db,
  defer,
  slots,
}: AppContextArgs): AppContext {
  const { env, clientAddress } = invocation;
  return createAppContext({
    db: db as Db,
    env,
    request,
    clientAddress,
    hooks: app.hooks,
    plugins: app.plugins,
    blocks: app.blocks,
    marks: app.marks,
    shortcodes: app.shortcodes,
    defer,
    assets: options.assets?.(env),
    storage: slots.storage,
    cache: slots.cache,
    kv: slots.kv,
    imageDelivery: slots.imageDelivery,
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
