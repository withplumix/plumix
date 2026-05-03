import type { RequestAuthenticator } from "../auth/authenticator.js";
import type { BootstrapVia, PlumixMagicLinkConfig } from "../auth/config.js";
import type { Mailer } from "../auth/mailer/types.js";
import type { OAuthProviderClient } from "../auth/oauth/types.js";
import type { AnyPluginDescriptor } from "../config.js";
import type { AppContext } from "../context/app.js";
import type { User, UserRole } from "../db/schema/users.js";
import type {
  ActionArgs,
  ActionName,
  FilterInput,
  FilterName,
  FilterRest,
} from "../hooks/types.js";
import type { PlumixApp } from "../runtime/app.js";
import type { PlumixEnv } from "../runtime/bindings.js";
import type {
  AssetsBinding,
  ConnectedObjectStorage,
  ImageDelivery,
} from "../runtime/slots.js";
import type { Factories } from "./factories.js";
import type { FetchOptions } from "./request.js";
import type { ActionSpy, FilterSpy } from "./spies.js";
import { auth } from "../auth/config.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";
import { plumix } from "../config.js";
import { createAppContext } from "../context/app.js";
import { buildApp } from "../runtime/app.js";
import { createPlumixDispatcher } from "../runtime/dispatcher.js";
import { factoriesFor, userFactory } from "./factories.js";
import { createTestDb } from "./harness.js";
import { buildRequest, TestResponse } from "./request.js";
import { spyAction, spyFilter } from "./spies.js";

type TestDb = Awaited<ReturnType<typeof createTestDb>>;

const stubAdapter = {
  name: "test",
  buildFetchHandler: () => () => new Response("stub", { status: 500 }),
};

const stubDatabase = {
  kind: "test",
  connect: () => ({ db: {} }),
};

export interface CreateDispatcherHarnessOptions {
  /**
   * Runtime environment bindings (KV, R2, Durable Objects, etc.). Exposed
   * on `h.env` so tests can assert on or interact with bindings directly —
   * the escape hatch for anything the harness doesn't abstract.
   */
  readonly env?: PlumixEnv;
  /**
   * Platform asset layer (e.g. Cloudflare's env.ASSETS). Provide a mock
   * when exercising the dispatcher's /_plumix/admin/* SPA fallback.
   */
  readonly assets?: AssetsBinding;
  /**
   * Plugins to install into the test app. Use when exercising public
   * routes, manifest projection, or plugin-registered hooks.
   */
  readonly plugins?: readonly AnyPluginDescriptor[];
  /**
   * On-the-fly image delivery slot. Stub it in tests that need
   * `ctx.imageDelivery` populated (e.g. media plugin route handlers).
   */
  readonly imageDelivery?: ImageDelivery;
  /**
   * Connected object storage. Stub it in tests that need `ctx.storage`
   * populated (e.g. media plugin upload route). Pass the result of
   * `memoryStorage().connect({})` for a working in-memory backend.
   */
  readonly storage?: ConnectedObjectStorage;
  /**
   * Configured OAuth providers for tests exercising the start/callback
   * routes. Pass `{ github: github({ clientId, clientSecret }), google:
   * google(...) }`. Passkey-only deployments leave undefined.
   */
  readonly oauth?: Readonly<Record<string, OAuthProviderClient>>;
  /**
   * Magic-link config for tests exercising the request/verify routes.
   * Pair with `mailer` at the top level (the request route requires
   * both — same cross-field invariant `plumix()` enforces).
   */
  readonly magicLink?: PlumixMagicLinkConfig;
  /**
   * Top-level outbound email transport. Tests that exercise magic-link
   * pass a capturing `Mailer` here so they can assert what was sent.
   */
  readonly mailer?: Mailer;
  /**
   * Override the default session-cookie authenticator. Tests for
   * external-SSO flows (cfAccess, custom guards) pass an instance
   * here; the dispatcher and RPC middleware both delegate to it.
   */
  readonly authenticator?: RequestAuthenticator;
  /**
   * Bootstrap-rail policy for tests exercising fresh-deploy signup
   * paths. `"first-method-wins"` opts the harness app into letting the
   * first OAuth/magic-link signup mint the admin (instead of the
   * default passkey-only rail).
   */
  readonly bootstrapVia?: BootstrapVia;
}

export interface DispatcherHarness {
  readonly db: TestDb;
  readonly app: PlumixApp;
  /** Pass-through env bindings. Empty by default; override via harness options. */
  readonly env: PlumixEnv;
  readonly dispatch: (
    request: Request,
    user?: User | null,
  ) => Promise<Response>;
  /**
   * Build and dispatch a request in one call. Returns a TestResponse with
   * chainable assertion helpers. Frontend tests should reach for this
   * first; use `dispatch` only when you need to build the Request yourself.
   */
  readonly fetch: (
    path: string,
    options?: FetchOptions,
  ) => Promise<TestResponse>;
  readonly authenticateRequest: (
    request: Request,
    userId: number,
  ) => Promise<Request>;
  readonly seedUser: (role?: UserRole) => Promise<User>;
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
}

const noop = (): void => undefined;
const silentLogger = {
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
};

function withRequest(
  app: PlumixApp,
  db: TestDb,
  env: PlumixEnv,
  assets: AssetsBinding | undefined,
  storage: ConnectedObjectStorage | undefined,
  request: Request,
  user: User | null,
): AppContext {
  return createAppContext({
    db,
    env,
    request,
    hooks: app.hooks,
    plugins: app.plugins,
    logger: silentLogger,
    user: user
      ? { id: user.id, email: user.email, role: user.role }
      : undefined,
    assets,
    storage,
    imageDelivery: app.config.imageDelivery,
    mailer: app.config.mailer,
    oauthProviders: app.oauthProviders,
    authenticator: app.authenticator,
    bootstrapAllowed: app.bootstrapAllowed,
  });
}

export async function createDispatcherHarness(
  options: CreateDispatcherHarnessOptions = {},
): Promise<DispatcherHarness> {
  const db = await createTestDb();
  const env = options.env ?? {};
  const config = plumix({
    runtime: stubAdapter,
    database: stubDatabase,
    auth: auth({
      passkey: {
        rpName: "Plumix Test",
        rpId: "cms.example",
        origin: "https://cms.example",
      },
      oauth: options.oauth ? { providers: options.oauth } : undefined,
      magicLink: options.magicLink,
      authenticator: options.authenticator,
      bootstrapVia: options.bootstrapVia,
    }),
    plugins: options.plugins,
    imageDelivery: options.imageDelivery,
    mailer: options.mailer,
  });
  const app = await buildApp(config);
  const dispatcher = createPlumixDispatcher(app);
  const { assets, storage } = options;

  const harness: DispatcherHarness = {
    db,
    app,
    env,
    dispatch: async (request, user = null) => {
      const ctx = withRequest(app, db, env, assets, storage, request, user);
      return dispatcher(ctx);
    },
    fetch: async (path, fetchOptions = {}) => {
      const request = await buildRequest(db, path, fetchOptions);
      const ctx = withRequest(
        app,
        db,
        env,
        assets,
        storage,
        request,
        fetchOptions.as ?? null,
      );
      const response = await dispatcher(ctx);
      return new TestResponse(response);
    },
    authenticateRequest: async (request, userId) => {
      const { token } = await createSession(db, { userId });
      const headers = new Headers(request.headers);
      headers.set("cookie", `${SESSION_COOKIE_NAME}=${token}`);
      return new Request(request, { headers });
    },
    seedUser: async (role = "subscriber") =>
      userFactory.transient({ db }).create({ role }),
    factory: factoriesFor(db),
    spyAction: (name) => spyAction(app.hooks, name),
    spyFilter: (name) => spyFilter(app.hooks, name),
  };
  return harness;
}

export function plumixRequest(path: string, init: RequestInit = {}): Request {
  const url = path.startsWith("http") ? path : `https://cms.example${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has("x-plumix-request")) {
    headers.set("x-plumix-request", "1");
  }
  return new Request(url, { ...init, headers });
}
