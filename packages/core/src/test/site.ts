import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { beforeEach } from "vitest";

import type { AnyPluginDescriptor, PlumixConfig } from "../config.js";
import type { AppContext, Db } from "../context/app-context.js";
import type { Entry } from "../db/schema/entries.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type { CdnFake } from "./cdn-fake.js";
import type { TestConfigInput } from "./config.js";
import type { Factories } from "./factories.js";
import type { MailFake } from "./mail-fake.js";
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
import { factoriesFor } from "./factories.js";
import { fakeMail } from "./mail-fake.js";
import { TestPage } from "./page.js";
import { buildRequest } from "./request.js";
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
> {
  /** Installed on top of core, in this order. */
  readonly plugins?: readonly AnyPluginDescriptor[];
  /** Plugin factories, joining core's on `site.factory` under these names. */
  readonly factories?: TFactories;
  /** The site's own platform bindings, as `env.MY_BINDING` reads them. */
  readonly env?: PlumixEnv;
  /** Config slots beyond `plugins`, as `plumix.config.ts` would write them. */
  readonly config?: TestConfigInput;
}

export interface TestSite<
  TFactories extends PluginFactories = Record<never, never>,
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
  /** Request a path, or an entry at its permalink, as an anonymous visitor. */
  readonly visit: (target: string | Entry) => Promise<TestPage>;
}

/**
 * A whole site, faked wherever the kit has a fake. With no arguments it is the
 * working directory's `plumix.config.ts`; with options, core plus what they
 * name.
 */
export async function testSite<
  TFactories extends PluginFactories = Record<never, never>,
>(options?: TestSiteOptions<TFactories>): Promise<TestSite<TFactories>> {
  const cwd = process.cwd();
  const config =
    options === undefined
      ? await loadProjectConfig(cwd)
      : testConfig({ ...options.config, plugins: options.plugins ?? [] });
  const { db, reset } = await createSiteDatabase(
    migrationFolders(siteRootOf(cwd), config.plugins),
  );
  let fakes = freshFakes();
  beforeEach(async () => {
    await reset();
    fakes = freshFakes();
  });
  const env = options?.env ?? {};
  const app = await buildApp(withFakes(config, () => fakes));
  const dispatcher = createPlumixDispatcher(app);
  const { defer } = createDeferQueue();

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

  const site: TestSite<TFactories> = {
    factory: {
      ...factoriesFor(db),
      ...(Object.fromEntries(
        Object.entries(options?.factories ?? {}).map(([name, factory]) => [
          name,
          factory.transient({ db }),
        ]),
      ) as TFactories),
    },
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
      const ctx = contextFor(await buildRequest(db, path));
      const response = await requestStore.run(ctx, () => dispatcher(ctx));
      return new TestPage({
        status: response.status,
        headers: response.headers,
        body: await response.text(),
        template: ctx.resolvedTemplate,
        route: ctx.resolvedRoute?.pattern ?? null,
      });
    },
  };

  async function permalinkOf(entry: Entry): Promise<string> {
    const path = await buildEntryPermalink(site.context, entry);
    if (path !== null) return path;
    throw new Error(
      `visit: entry #${String(entry.id)} has no public URL, because its type "${entry.type}" is not registered or not public.`,
    );
  }

  return site;
}

/** The package a folder sits in, which is where its site's migrations live. */
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

/**
 * A cdn only where the config names one, since naming one turns page caching
 * on. Storage, kv and image delivery have no fake yet, so stay unbound.
 */
function withFakes(config: PlumixConfig, current: () => Fakes): PlumixConfig {
  return {
    ...config,
    database: { kind: "test", connect: () => ({ db: {} }) },
    mailer: { send: (message) => current().mail.send(message) },
    cdn:
      config.cdn === undefined
        ? undefined
        : { kind: "test", connect: () => current().cdn },
    storage: undefined,
    kv: undefined,
    imageDelivery: undefined,
  };
}
