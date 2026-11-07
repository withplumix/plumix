import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { afterEach, beforeEach } from "vitest";

import type { AnyPluginDescriptor, PlumixConfig } from "../config.js";
import type { AppContext, Db, Logger } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import type { User } from "../db/schema/users.js";
import type { HookRegistry } from "../hooks/registry.js";
import type { PluginDescriptor, PluginRpcRouters } from "../plugin/define.js";
import type { PluginRpcClient } from "../plugin/registry.js";
import type { AppRouterClient } from "../rpc/router.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type { ConnectedKv, ObjectStorage } from "../runtime/contract/slots.js";
import type { CdnFake } from "./cdn-fake.js";
import type { TestConfigInput } from "./config.js";
import type { EventsFake } from "./events-fake.js";
import type { Factories, SeededRole } from "./factories.js";
import type { FetchFake } from "./fetch-fake.js";
import type { FiltersFake } from "./filters-fake.js";
import type { LoggerFake } from "./logger-fake.js";
import type { MailFake } from "./mail-fake.js";
import type { FetchOptions } from "./request.js";
import type { TestRunReport, TestSchedule } from "./schedule.js";
import type { Travel } from "./site-clock.js";
import type { StorageFake } from "./storage-fake.js";
import type { TelemetryFake } from "./telemetry-fake.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";
import { withUser } from "../auth/with-user.js";
import { createAppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { buildEntryPermalink } from "../route/permalink.js";
import { buildApp } from "../runtime/app.js";
import { createPlumixDispatcher } from "../runtime/dispatcher.js";
import { bindSlots, requestContextArgs } from "../runtime/handler.js";
import { memoryKv } from "../runtime/memory-kv.js";
import { fakeCdn } from "./cdn-fake.js";
import { testConfig } from "./config.js";
import { createDeferQueue } from "./defer.js";
import { fakeEvents } from "./events-fake.js";
import { factoriesFor, userFactory } from "./factories.js";
import { fakeFetch } from "./fetch-fake.js";
import { fakeFilters } from "./filters-fake.js";
import { fakeLogger } from "./logger-fake.js";
import { fakeMail } from "./mail-fake.js";
import { TestPage } from "./page.js";
import { appendCookie, buildRequest } from "./request.js";
import { findTask, runTasks, scheduleOf } from "./schedule.js";
import { siteClock } from "./site-clock.js";
import { createSiteDatabase } from "./site-database.js";
import { migrationFolders } from "./site-migrations.js";
import { fakeStorage } from "./storage-fake.js";
import { fakeTelemetry } from "./telemetry-fake.js";

/**
 * A plugin's factory, bound to the site's database as `factoriesFor` binds
 * core's: through `.transient({ db })`.
 */
interface PluginFactory {
  /** A method, so a factory typed for a plugin's own schema still fits. */
  transient(params: { db: Db }): unknown;
}

type PluginFactories = Readonly<Record<string, PluginFactory>>;

export interface TestSiteOptions<
  TFactories extends PluginFactories = Record<never, never>,
  TPlugins extends readonly AnyPluginDescriptor[] = [],
> {
  /** Installed on top of core, in this order. */
  readonly plugins?: TPlugins;
  /** Plugin factories, joining core's on `site.factory` under these names. */
  readonly factories?: TFactories;
  /** The site's own platform bindings, as `env.MY_BINDING` reads them. */
  readonly env?: PlumixEnv;
  /** Config slots beyond `plugins`, as `plumix.config.ts` would write them. */
  readonly config?: TestConfigInput;
}

export interface TestSite<
  TFactories extends PluginFactories = Record<never, never>,
  TRpc extends PluginRpcRouters = Record<never, never>,
> {
  readonly factory: Factories & TFactories;
  /** Every mail the site sent; the site's mailer delivers nothing. */
  readonly mail: MailFake;
  /** What the site's cdn stored and which tags a write purged from it. */
  readonly cdn: CdnFake;
  /** Answers `ctx.fetch` from the routes a test declares; none reaches the network. */
  readonly fetch: FetchFake;
  /** Every line the site logged; none reaches the console. */
  readonly logger: LoggerFake;
  /** The telemetry snapshot of every request and firing, in place of the config's consumers. */
  readonly telemetry: TelemetryFake;
  /**
   * The bucket a config that declares `storage` gets, in memory. It answers a
   * browser's presigned PUT, and the site serves what it holds at its URLs.
   */
  readonly storage: StorageFake;
  /** Every event the site emitted; its handlers still run. */
  readonly events: EventsFake;
  /**
   * Every filter the site applied. A test changes a filter's result by
   * adding a handler, as a plugin does.
   */
  readonly filters: FiltersFake;
  readonly env: PlumixEnv;
  /**
   * A fresh context for calling a service directly, as the user `actingAs`
   * names. Throws for a role whose user no call has created yet.
   */
  readonly context: AppContext;
  /**
   * Request a path, or an entry at its permalink, as a visitor or the user
   * `actingAs` names; a GET unless `options` names a method. Deferred work
   * settles first.
   */
  readonly visit: (
    target: string | Entry,
    options?: Pick<FetchOptions, "method" | "headers" | "body">,
  ) => Promise<TestPage>;
  /**
   * Calls a procedure over the wire, through the site's own dispatcher.
   * Deferred work settles before it resolves.
   */
  readonly rpc: AppRouterClient & PluginRpcClient<TRpc>;
  /**
   * This site, calling as the user, or as a user of the role created on its
   * first call in each test.
   */
  readonly actingAs: (
    principal: User | SeededRole,
  ) => TestSite<TFactories, TRpc>;
  /** Moves this site's clock forward, and no other site's. */
  readonly travel: (by: Travel) => void;
  /** Stops this site's clock at an instant, which `travel` then moves. */
  readonly freezeTime: (iso: string) => void;
  /**
   * Fires `cron` as the scheduler would: every task on it, and every task
   * that declares no cron. Deferred work settles before it resolves.
   */
  readonly runSchedule: (cron: string) => Promise<TestRunReport>;
  /** Runs one task by its `plugin:task` id, whatever its cron. */
  readonly runTask: (id: string) => Promise<TestRunReport>;
  readonly schedule: TestSchedule;
}

type InstalledRpc<TPlugins extends readonly AnyPluginDescriptor[]> =
  TPlugins extends readonly [
    Pick<PluginDescriptor<never, infer TRpc>, "~rpc">,
    ...infer TRest extends readonly AnyPluginDescriptor[],
  ]
    ? TRpc & InstalledRpc<TRest>
    : Record<never, never>;

/** `null` is a visitor; a bare role is a user not created yet. */
type Principal = User | { readonly role: SeededRole } | null;

interface Session {
  readonly user: User;
  readonly cookie: string;
}

/** One principal's sign-in within a test; `settled` is set once it resolves. */
interface SignIn {
  readonly session: Promise<Session>;
  settled?: Session;
}

/**
 * A whole site, faked wherever the kit has a fake. With no arguments it is the
 * working directory's `plumix.config.ts`; with options, core plus what they
 * name.
 */
export async function testSite<
  TFactories extends PluginFactories = Record<never, never>,
  const TPlugins extends readonly AnyPluginDescriptor[] = [],
>(
  options?: TestSiteOptions<TFactories, TPlugins>,
): Promise<TestSite<TFactories, InstalledRpc<TPlugins>>> {
  const cwd = process.cwd();
  const config =
    options === undefined
      ? await loadProjectConfig(cwd)
      : testConfig({ ...options.config, plugins: options.plugins ?? [] });
  const { db, reset } = await createSiteDatabase(
    migrationFolders(siteRootOf(cwd), config.plugins),
    { d1: config.database.kind === "d1" },
  );
  const { defer, drainDeferred } = createDeferQueue();
  const time = siteClock();
  let fakes = freshFakes(config.storage);
  let signedIn = new WeakMap<NonNullable<Principal>, SignIn>();
  beforeEach(async () => {
    await drainDeferred();
    await reset();
    fakes = freshFakes(config.storage);
    time.reset();
    signedIn = new WeakMap();
  });
  afterEach(() => {
    fakes.fetch.assertAllDeclared();
  });
  // The fake is rebuilt before each test, so each line goes to the current one.
  const logger: Logger = {
    debug: (message, meta) => {
      fakes.logger.debug(message, meta);
    },
    info: (message, meta) => {
      fakes.logger.info(message, meta);
    },
    warn: (message, meta) => {
      fakes.logger.warn(message, meta);
    },
    error: (message, meta) => {
      fakes.logger.error(message, meta);
    },
  };
  const env = options?.env ?? {};
  const app = await buildApp(withFakes(config, () => fakes));
  const dispatcher = createPlumixDispatcher(app);
  const hooks = recordingHooks(app.hooks, () => fakes);

  const contextFor = (request: Request): AppContext =>
    createAppContext({
      ...requestContextArgs({
        app,
        env,
        request,
        clientAddress: undefined,
        db,
        defer,
        assets: undefined,
        slots: bindSlots(app, env),
      }),
      hooks,
      clock: time.clock,
      fetch: (input, init) => fakes.fetch.send(input, init),
      logger,
      onMailSent: (sent) => {
        fakes.mail.record(sent);
      },
    });

  // Deferred work settles before it resolves, so the snapshot is delivered.
  async function dispatch(ctx: AppContext): Promise<Response> {
    if (config.storage !== undefined && (await isStoragePath(ctx.request))) {
      return fakes.storage.fetch(ctx.request);
    }
    const response = await requestStore.run(ctx, () => dispatcher(ctx));
    await drainDeferred();
    return response;
  }

  async function isStoragePath(request: Request): Promise<boolean> {
    const base = new URL(await fakes.storage.url(""), request.url);
    return new URL(request.url).pathname.startsWith(base.pathname);
  }

  const factory = {
    ...factoriesFor(db),
    ...(Object.fromEntries(
      Object.entries(options?.factories ?? {}).map(([name, factory]) => [
        name,
        factory.transient({ db }),
      ]),
    ) as TFactories),
  };

  async function fire(
    tasks: typeof app.scheduledTasks,
    cron?: string,
  ): Promise<TestRunReport> {
    const query = cron === undefined ? "" : `?cron=${encodeURIComponent(cron)}`;
    const ctx = contextFor(
      new Request(`https://cms.example/_plumix/internal/scheduled${query}`, {
        method: "POST",
      }),
    );
    const report = await requestStore.run(ctx, () =>
      runTasks(tasks, ctx, cron),
    );
    await drainDeferred();
    return report;
  }

  function siteActingAs(
    principal: Principal,
  ): TestSite<TFactories, InstalledRpc<TPlugins>> {
    const signIn = async (request: Request): Promise<Request> => {
      if (principal === null) return request;
      let current = signedIn.get(principal);
      if (current === undefined) {
        const record: SignIn = {
          session: sessionFor(db, principal, contextFor(request)).then(
            (session) => {
              record.settled = session;
              return session;
            },
          ),
        };
        current = record;
        signedIn.set(principal, current);
      }
      const headers = new Headers(request.headers);
      appendCookie(headers, (await current.session).cookie);
      return new Request(request, { headers });
    };
    const userOf = (bound: NonNullable<Principal>): User => {
      if ("id" in bound) return bound;
      const user = signedIn.get(bound)?.settled?.user;
      if (user !== undefined) return user;
      throw new Error(
        `context: the "${bound.role}" user is created by this site's first rpc or visit call. Make one first, or pass a user to actingAs.`,
      );
    };
    return {
      factory,
      get mail() {
        return fakes.mail;
      },
      get cdn() {
        return fakes.cdn;
      },
      get fetch() {
        return fakes.fetch;
      },
      get logger() {
        return fakes.logger;
      },
      get telemetry() {
        return fakes.telemetry;
      },
      get storage() {
        return fakes.storage;
      },
      get events() {
        return fakes.events;
      },
      get filters() {
        return fakes.filters;
      },
      env,
      get context() {
        const ctx = contextFor(new Request("https://cms.example/"));
        if (principal === null) return ctx;
        const { id, email, role, meta } = userOf(principal);
        return withUser(ctx, { id, email, role, meta });
      },
      visit: async (target, options) => {
        const path =
          typeof target === "string" ? target : await permalinkOf(target);
        const ctx = contextFor(
          await signIn(await buildRequest(db, path, options)),
        );
        const response = await dispatch(ctx);
        return new TestPage({
          status: response.status,
          headers: response.headers,
          body: await response.text(),
          template: ctx.resolvedTemplate,
          route: ctx.resolvedRoute?.pattern ?? null,
        });
      },
      rpc: rpcClient(async (request) =>
        dispatch(contextFor(await signIn(request))),
      ),
      actingAs: (next) =>
        siteActingAs(typeof next === "string" ? { role: next } : next),
      travel: time.travel,
      freezeTime: time.freezeTime,
      runSchedule: (cron) => fire(app.scheduledTasks, cron),
      runTask: (id) => fire([findTask(app.scheduledTasks, id, "runTask")]),
      schedule: scheduleOf(app.scheduledTasks),
    };
  }

  const site = siteActingAs(null);

  async function permalinkOf(entry: Entry): Promise<string> {
    const path = await buildEntryPermalink(site.context, entry);
    if (path !== null) return path;
    throw new Error(
      `visit: entry #${String(entry.id)} has no public URL, because its type "${entry.type}" is not registered or not public.`,
    );
  }

  return site;
}

async function sessionFor(
  db: Db,
  principal: NonNullable<Principal>,
  ctx: AppContext,
): Promise<Session> {
  const user =
    "id" in principal
      ? principal
      : await userFactory.transient({ db }).create({ role: principal.role });
  // Inside the site's context, so the session's lifetime starts on its clock.
  const { token } = await requestStore.run(ctx, () =>
    createSession(db, { userId: user.id }),
  );
  return { user, cookie: `${SESSION_COOKIE_NAME}=${token}` };
}

function rpcClient<TRpc extends PluginRpcRouters>(
  dispatch: (request: Request) => Promise<Response>,
): AppRouterClient & PluginRpcClient<TRpc> {
  const link = new RPCLink({
    url: "https://cms.example/_plumix/rpc",
    headers: { "x-plumix-request": "1" },
    fetch: (request) => dispatch(request),
  });
  return createORPCClient<AppRouterClient & PluginRpcClient<TRpc>>(link);
}

function siteRootOf(dir: string): string {
  for (let current = dir; ; current = dirname(current)) {
    if (existsSync(join(current, "package.json"))) return current;
    if (dirname(current) === current) return dir;
  }
}

const PROJECT_CONFIGS = [
  "plumix.config.ts",
  "plumix.config.js",
  "plumix.config.mjs",
] as const;

/**
 * Imported through the test runner, so the config shares the module graph the
 * test kit runs in.
 */
async function loadProjectConfig(cwd: string): Promise<PlumixConfig> {
  const path = PROJECT_CONFIGS.map((name) => join(cwd, name)).find(existsSync);
  if (path === undefined) {
    throw new Error(
      `testSite: no plumix.config.{ts,js,mjs} in ${cwd}. Run the test from the project, or pass { plugins } to boot core plus the plugins you list.`,
    );
  }
  const module = (await import(
    /* @vite-ignore */ pathToFileURL(path).href
  )) as { readonly default: PlumixConfig };
  return module.default;
}

interface Fakes {
  readonly mail: MailFake;
  readonly cdn: CdnFake;
  readonly fetch: FetchFake;
  readonly logger: LoggerFake;
  readonly telemetry: TelemetryFake;
  readonly storage: StorageFake;
  readonly kv: ConnectedKv;
  readonly events: EventsFake;
  readonly filters: FiltersFake;
}

function freshFakes(storage: ObjectStorage | undefined): Fakes {
  return {
    mail: fakeMail(),
    cdn: fakeCdn(),
    fetch: fakeFetch(),
    logger: fakeLogger(),
    telemetry: fakeTelemetry(),
    storage: fakeStorage(storage),
    kv: memoryKv().connect(),
    events: fakeEvents(),
    filters: fakeFilters(),
  };
}

/**
 * The app's hooks, recording each emit and apply into the current fakes before its
 * handlers run. Every context the site builds dispatches through it.
 */
function recordingHooks(
  hooks: HookRegistry,
  current: () => Fakes,
): HookRegistry {
  const emit: HookRegistry["emit"] = (event, payload, ctx) => {
    current().events.record(event, payload);
    return hooks.emit(event, payload, ctx);
  };
  const apply: HookRegistry["apply"] = (filter, value, input, ctx) => {
    current().filters.record(filter, input);
    return hooks.apply(filter, value, input, ctx);
  };
  return new Proxy(hooks, {
    get: (target, key) => {
      if (key === "emit") return emit;
      if (key === "apply") return apply;
      const value: unknown = Reflect.get(target, key, target);
      if (typeof value !== "function") return value;
      // Safety: a registry method, bound since its private fields are read
      // only on the registry itself.
      const method = value as (...args: unknown[]) => unknown;
      return method.bind(target);
    },
  });
}

/**
 * The config's own telemetry consumers are replaced, so none exports from a
 * test.
 */
function withFakes(config: PlumixConfig, current: () => Fakes): PlumixConfig {
  return {
    ...config,
    database: { kind: "test", connect: () => ({ db: {} }) },
    mailer: { send: (message) => current().mail.send(message) },
    cdn: { kind: "test", connect: () => current().cdn },
    telemetry: {
      consumers: [
        {
          id: "test-site",
          onRequestEnd: (snapshot) => {
            current().telemetry.record(snapshot);
          },
        },
      ],
    },
    storage: config.storage && {
      kind: "test",
      connect: () => current().storage,
    },
    kv: config.kv && { kind: "test", connect: () => current().kv },
    imageDelivery: config.imageDelivery && {
      kind: "test",
      acceptsRelativeSources: true,
      url: (sourceUrl) => sourceUrl,
    },
  };
}
