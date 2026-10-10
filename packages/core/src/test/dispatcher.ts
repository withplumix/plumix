import type {
  AppContext,
  Db,
  DeferFn,
  Logger,
} from "../context/app-context.js";
import type { User, UserRole } from "../db/schema/users.js";
import type {
  ActionArgs,
  ActionName,
  FilterInput,
  FilterName,
  FilterRest,
} from "../hooks/types.js";
import type { AssetManifest } from "../route/render/asset-manifest.js";
import type { PluginCatalogs } from "../route/render/block-catalog.js";
import type { PlumixApp } from "../runtime/app.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type {
  AssetsBinding,
  ConnectedCdn,
  ConnectedKv,
  ConnectedObjectStorage,
} from "../runtime/contract/slots.js";
import type { BoundSlots } from "../runtime/handler.js";
import type { TestConfigInput } from "./config.js";
import type { Factories } from "./factories.js";
import type { HarnessFetchOptions } from "./request.js";
import type { ActionSpy, FilterSpy } from "./spies.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createPreviewToken } from "../auth/preview-token.js";
import { createSession } from "../auth/sessions.js";
import { createAppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { buildApp } from "../runtime/app.js";
import { createPlumixDispatcher } from "../runtime/dispatcher.js";
import { bindSlots, requestContextArgs } from "../runtime/handler.js";
import { testConfig } from "./config.js";
import { silentLogger } from "./context.js";
import { createDeferQueue } from "./defer.js";
import { factoriesFor, userFactory } from "./factories.js";
import { createTestDb } from "./harness.js";
import { appendCookie, buildRequest, TestResponse } from "./request.js";
import { spyAction, spyFilter } from "./spies.js";

export interface CreateDispatcherHarnessOptions {
  /** A supplied db arrives with its schema already applied; the default gets core's. */
  readonly db?: Db;
  /**
   * Runtime environment bindings (KV, R2, Durable Objects, etc.). Exposed
   * on `h.env` so tests can assert on or interact with bindings directly —
   * the escape hatch for anything the harness doesn't abstract.
   */
  readonly env?: PlumixEnv;
  /**
   * The client address the runtime reports, as `invocation.clientAddress`.
   * Unset means the runtime resolved none, whatever forwarding header the
   * request carries.
   */
  readonly clientAddress?: string;
  /**
   * Platform asset layer (e.g. Cloudflare's env.ASSETS). Provide a mock
   * when exercising the dispatcher's /_plumix/admin/* SPA fallback.
   */
  readonly assets?: AssetsBinding;
  /**
   * The app's config slots, as `plumix.config.ts` would write them — plugins,
   * `basePath`, `mailer`, `auth: { magicLink }` and the rest. Resolved through
   * `plumix()`, so the harness app runs the config a deployment would.
   */
  readonly config?: TestConfigInput;
  /**
   * Connected object storage. Stub it in tests that need `ctx.storage`
   * populated (e.g. media plugin upload route). Pass the result of
   * `memoryStorage().connect()` for a working in-memory backend.
   */
  readonly storage?: ConnectedObjectStorage;
  /**
   * Bound CDN. Stub it in tests that exercise the public read-through
   * path (`ctx.cdn`); the dispatcher consults it for cacheable public GETs.
   */
  readonly cdn?: ConnectedCdn;
  /**
   * Connected key/value store. Stub it in tests that need `ctx.kv` populated;
   * pass `memoryKv().connect()` for a working in-memory backend.
   */
  readonly kv?: ConnectedKv;
  /**
   * Substitute the app's lazy cold-interface handlers, the seam for observing
   * whether the dispatcher reached for one.
   */
  readonly coldInterfaces?: Partial<
    Pick<PlumixApp, "loadMcpHandler" | "loadRestHandler">
  >;
  /**
   * Vite-emitted asset manifest. Tests that exercise the renderer's
   * `<link rel="stylesheet">` auto-injection pass a stub manifest here;
   * the default empty object mirrors the runtime's "no client entries"
   * fallback.
   */
  readonly assetManifest?: AssetManifest;
  /**
   * Plugin compiled catalogs by locale, as `virtual:plumix/plugin-catalogs`
   * hands them to the generated entry. Tests of localized block render
   * strings pass one here.
   */
  readonly pluginCatalogs?: PluginCatalogs;
  /**
   * Logger the request context carries. Defaults to the silent one; pass a
   * capturing logger to assert on what a handler reported.
   */
  readonly logger?: Logger;
}

export interface DispatcherHarness {
  readonly db: Db;
  readonly app: PlumixApp;
  /** Pass-through env bindings. Empty by default; override via harness options. */
  readonly env: PlumixEnv;
  /**
   * Dispatch as the runtime adapter does: the context carries no user, so a
   * signed-in request says so through its session — see
   * {@link DispatcherHarness.authenticateRequest}.
   */
  readonly dispatch: (
    request: Request,
    /** See {@link HarnessFetchOptions.clientAddress}; wins over the harness's own. */
    clientAddress?: string,
  ) => Promise<Response>;
  /**
   * Build and dispatch a request in one call; use `dispatch` only to build the
   * Request yourself.
   */
  readonly fetch: (
    path: string,
    options?: HarnessFetchOptions,
  ) => Promise<TestResponse>;
  readonly authenticateRequest: (
    request: Request,
    userId: number,
  ) => Promise<Request>;
  readonly seedUser: (role?: UserRole) => Promise<User>;
  /**
   * A `?preview=` token granting `userId`'s preview of `entryId`, as the
   * editor's preview link mints one — so a render carrying it overlays that
   * user's autosave onto the entry.
   */
  readonly mintPreviewToken: (args: {
    readonly entryId: number;
    readonly userId: number;
  }) => Promise<string>;
  /** Pre-bound factories. Mirrors the `factory` surface of createRpcHarness. */
  readonly factory: Factories;
  /**
   * Record every invocation of the named action. Call assertions on the
   * returned spy (`.assertCalledOnce()`, `.assertCalledWith(...)`).
   */
  readonly spyAction: <TName extends ActionName>(
    name: TName,
  ) => ActionSpy<ActionArgs<TName>>;
  /**
   * Record every invocation of the named filter. Pass-through by default;
   * call `.override(fn)` on the returned spy to transform values.
   */
  readonly spyFilter: <TName extends FilterName>(
    name: TName,
  ) => FilterSpy<FilterInput<TName>, FilterRest<TName>>;
  /**
   * Await everything routed through `ctx.defer` so far (telemetry snapshot
   * delivery, CDN purges). Mirrors the platform's `waitUntil`: call
   * after a dispatch, before asserting on deferred side effects.
   */
  readonly drainDeferred: () => Promise<void>;
}

/**
 * Bind everything a harness fixes for its lifetime — the app, the slots, the
 * defer queue — so each dispatch supplies only what a request varies.
 */
function createContextFactory(args: {
  readonly app: PlumixApp;
  readonly options: CreateDispatcherHarnessOptions;
  readonly db: Db;
  readonly env: PlumixEnv;
  readonly defer: DeferFn;
}): (request: Request, clientAddress?: string) => AppContext {
  const { app, options, db, env, defer } = args;
  // The harness config declares no storage or kv slot, so a test hands in the
  // connected store directly; image delivery and cdn bind through the config.
  const slots: BoundSlots = {
    ...bindSlots(app, env),
    storage: options.storage,
    kv: options.kv,
  };
  return (request, clientAddress) =>
    createAppContext({
      ...requestContextArgs({
        app,
        env,
        request,
        clientAddress: clientAddress ?? options.clientAddress,
        db,
        defer,
        assets: options.assets,
        slots,
      }),
      logger: options.logger ?? silentLogger,
    });
}

export async function createDispatcherHarness(
  options: CreateDispatcherHarnessOptions = {},
): Promise<DispatcherHarness> {
  const db = options.db ?? (await createTestDb());
  const env = options.env ?? {};
  const { cdn } = options;
  const config = testConfig({
    ...options.config,
    // Declared as well as bound: core subscribes its entry-mutation purges only
    // where the config names a cdn, so a stub bound alone would never see one.
    cdn: cdn === undefined ? undefined : { kind: "test", connect: () => cdn },
  });
  const built = await buildApp(config, {
    assetManifest: options.assetManifest,
    pluginCatalogs: options.pluginCatalogs,
  });
  const app: PlumixApp = { ...built, ...options.coldInterfaces };
  const dispatcher = createPlumixDispatcher(app);
  const { defer, drainDeferred } = createDeferQueue();
  const withRequest = createContextFactory({ app, options, db, env, defer });

  const harness: DispatcherHarness = {
    db,
    app,
    env,
    dispatch: async (request, clientAddress) => {
      const ctx = withRequest(request, clientAddress);
      // Mirror the runtime adapter, which runs dispatch inside the request
      // store so `tryGetContext()`-based features (DB logging, debug spans)
      // see the context.
      return requestStore.run(ctx, () => dispatcher(ctx));
    },
    fetch: async (path, fetchOptions = {}) => {
      const request = await buildRequest(db, path, fetchOptions);
      const ctx = withRequest(request, fetchOptions.clientAddress);
      const response = await requestStore.run(ctx, () => dispatcher(ctx));
      return new TestResponse(response, ctx.resolvedTemplate);
    },
    authenticateRequest: async (request, userId) => {
      const { token } = await createSession(db, { userId });
      const headers = new Headers(request.headers);
      appendCookie(headers, `${SESSION_COOKIE_NAME}=${token}`);
      return new Request(request, { headers });
    },
    seedUser: async (role = "subscriber") =>
      userFactory.transient({ db }).create({ role }),
    mintPreviewToken: (args) => createPreviewToken(db, args),
    factory: factoriesFor(db),
    spyAction: (name) => spyAction(app.hooks, name),
    spyFilter: (name) => spyFilter(app.hooks, name),
    drainDeferred,
  };
  return harness;
}

// They carry no Node dependency, so they live apart from the harness for the
// browser build of the test surface (`./browser.ts`) to reach them alone.
export { DEV_ORIGIN, plumixRequest } from "./plumix-request.js";
