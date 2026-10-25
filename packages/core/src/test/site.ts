import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { beforeEach } from "vitest";

import type { AnyPluginDescriptor, PlumixConfig } from "../config.js";
import type { AppContext, Db } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import type { User, UserRole } from "../db/schema/users.js";
import type { PluginDescriptor, PluginRpcRouters } from "../plugin/define.js";
import type { PluginRpcClient } from "../plugin/registry.js";
import type { AppRouterClient } from "../rpc/router.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type { CdnFake } from "./cdn-fake.js";
import type { TestConfigInput } from "./config.js";
import type { Factories } from "./factories.js";
import type { MailFake } from "./mail-fake.js";
import { SESSION_COOKIE_NAME } from "../auth/cookies.js";
import { createSession } from "../auth/sessions.js";
import { createAppContext } from "../context/app.js";
import { requestStore } from "../context/stores.js";
import { buildEntryPermalink } from "../route/permalink.js";
import { buildApp } from "../runtime/app.js";
import { createPlumixDispatcher } from "../runtime/dispatcher.js";
import { bindSlots, requestContextArgs } from "../runtime/handler.js";
import { fakeCdn } from "./cdn-fake.js";
import { testConfig } from "./config.js";
import { silentLogger } from "./context.js";
import { createDeferQueue } from "./defer.js";
import { factoriesFor, userFactory } from "./factories.js";
import { fakeMail } from "./mail-fake.js";
import { TestPage } from "./page.js";
import { appendCookie, buildRequest } from "./request.js";
import { createSiteDatabase } from "./site-database.js";
import { migrationFolders } from "./site-migrations.js";

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
  readonly env: PlumixEnv;
  /**
   * A fresh context for calling a service directly, with the site's config,
   * plugins and database.
   */
  readonly context: AppContext;
  /**
   * Request a path, or an entry at its permalink, as a visitor or the user
   * `actingAs` names.
   */
  readonly visit: (target: string | Entry) => Promise<TestPage>;
  /** Calls a procedure over the wire, through the site's own dispatcher. */
  readonly rpc: AppRouterClient & PluginRpcClient<TRpc>;
  /**
   * This site, calling as the user, or as a user of the role created on its
   * first call in each test.
   */
  readonly actingAs: (principal: User | UserRole) => TestSite<TFactories, TRpc>;
}

type InstalledRpc<TPlugins extends readonly AnyPluginDescriptor[]> =
  TPlugins extends readonly [
    Pick<PluginDescriptor<never, infer TRpc>, "~rpc">,
    ...infer TRest extends readonly AnyPluginDescriptor[],
  ]
    ? TRpc & InstalledRpc<TRest>
    : Record<never, never>;

/** `null` is a visitor; a bare role is a user not created yet. */
type Principal = User | { readonly role: UserRole } | null;

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
  );
  const { defer, drainDeferred } = createDeferQueue();
  let fakes = freshFakes();
  let signedIn = new WeakMap<NonNullable<Principal>, Promise<string>>();
  beforeEach(async () => {
    await drainDeferred();
    await reset();
    fakes = freshFakes();
    signedIn = new WeakMap();
  });
  const env = options?.env ?? {};
  const app = await buildApp(withFakes(config, () => fakes));
  const dispatcher = createPlumixDispatcher(app);

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
      logger: silentLogger,
      onMailSent: (sent) => {
        fakes.mail.record(sent);
      },
    });

  async function dispatch(request: Request): Promise<Response> {
    const ctx = contextFor(request);
    return requestStore.run(ctx, () => dispatcher(ctx));
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

  function siteActingAs(
    principal: Principal,
  ): TestSite<TFactories, InstalledRpc<TPlugins>> {
    const signIn = async (request: Request): Promise<Request> => {
      if (principal === null) return request;
      let cookie = signedIn.get(principal);
      if (cookie === undefined) {
        cookie = sessionCookieFor(db, principal);
        signedIn.set(principal, cookie);
      }
      const headers = new Headers(request.headers);
      appendCookie(headers, await cookie);
      return new Request(request, { headers });
    };
    return {
      factory,
      get mail() {
        return fakes.mail;
      },
      env,
      get context() {
        return contextFor(new Request("https://cms.example/"));
      },
      visit: async (target) => {
        const path =
          typeof target === "string" ? target : await permalinkOf(target);
        const ctx = contextFor(await signIn(await buildRequest(db, path)));
        const response = await requestStore.run(ctx, () => dispatcher(ctx));
        return new TestPage({
          status: response.status,
          headers: response.headers,
          body: await response.text(),
          template: ctx.resolvedTemplate,
          route: ctx.resolvedRoute?.pattern ?? null,
        });
      },
      rpc: rpcClient(async (request) => dispatch(await signIn(request))),
      actingAs: (next) =>
        siteActingAs(typeof next === "string" ? { role: next } : next),
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

async function sessionCookieFor(
  db: Db,
  principal: NonNullable<Principal>,
): Promise<string> {
  const user =
    "id" in principal
      ? principal
      : await userFactory.transient({ db }).create({ role: principal.role });
  const { token } = await createSession(db, { userId: user.id });
  return `${SESSION_COOKIE_NAME}=${token}`;
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
}

function freshFakes(): Fakes {
  return { mail: fakeMail(), cdn: fakeCdn() };
}

/** Storage, kv and image delivery have no fake yet, so they stay unbound. */
function withFakes(config: PlumixConfig, current: () => Fakes): PlumixConfig {
  return {
    ...config,
    database: { kind: "test", connect: () => ({ db: {} }) },
    mailer: { send: (message) => current().mail.send(message) },
    cdn: { kind: "test", connect: () => current().cdn },
    storage: undefined,
    kv: undefined,
    imageDelivery: undefined,
  };
}
