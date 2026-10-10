import type { RequestAuthenticator } from "../auth/authenticator.js";
import type { AuthMethodsSummary } from "../auth/contract/auth-methods.js";
import type {
  BlockRegistry,
  MarkSpec,
  ShortcodeRegistry,
} from "../blocks/index.js";
import type { PlumixConfig } from "../config.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { MailCatalogs } from "../mail/catalogs.js";
import type { DeclaredMails } from "../mail/declared.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type { EnvInput } from "../runtime/contract/env-input.js";
import type {
  AssetsBinding,
  ConnectedCdn,
  ConnectedKv,
  ConnectedObjectStorage,
  ImageDelivery,
} from "../runtime/contract/slots.js";
import type {
  AppContext,
  AppContextBase,
  AuthenticatedUser,
  Db,
  DeferFn,
  Logger,
} from "./app-context.js";
import type { DevRuntime } from "./dev-runtime.js";
import type { TelemetryCollector, TelemetryConsumer } from "./telemetry.js";
import { defaultAuthenticator } from "../auth/authenticator.js";
import { resolveMailer } from "../auth/mailer/resolve.js";
import { makeAuthCan } from "../auth/with-user.js";
import { createBlockRegistry } from "../blocks/index.js";
import { debugBarTelemetryConsumer } from "../dev/debug-bar/consumer.js";
import { debugHistoryConsumer } from "../dev/request-history/writer.js";
import { resolveLocale } from "../i18n/resolve-locale.js";
import { createMailCatalogs } from "../mail/catalogs.js";
import { declareMails } from "../mail/declared.js";
import { createMailSender } from "../mail/sender.js";
import { resolveEnvInput } from "../runtime/contract/env-input.js";
import { createTelemetryCollector } from "./collector.js";
import { ContextError } from "./errors.js";
import { logErrorSafely } from "./log.js";
import { createRequestMemo } from "./memo.js";
import { NOOP_TELEMETRY } from "./telemetry.js";
import { createTracedFetch } from "./traced-fetch.js";
import {
  traceAssets,
  traceCdn,
  traceKv,
  traceMailer,
  traceStorage,
} from "./traced-slots.js";

const EMPTY_BLOCK_REGISTRY: BlockRegistry = createBlockRegistry([]);
const EMPTY_MARK_LIST: readonly MarkSpec[] = Object.freeze([]);
const EMPTY_SHORTCODE_REGISTRY: ShortcodeRegistry = new Map();
/**
 * A context built without an app (bare test/util contexts) renders against
 * core's own catalogs.
 */
const CORE_MAIL_CATALOGS_ONLY: MailCatalogs = createMailCatalogs();
/**
 * Fallback for contexts built without an app wiring auth (bare test/util
 * contexts). The real app always passes `app.authMethods`.
 */
const NO_AUTH_METHODS: AuthMethodsSummary = Object.freeze({
  passkey: false,
  magicLink: false,
  oauth: Object.freeze([]),
});

export interface CreateAppContextArgs<TSchema extends Record<string, unknown>> {
  readonly db: Db<TSchema>;
  readonly env: PlumixEnv;
  readonly request: Request;
  readonly config: PlumixConfig;
  /** See {@link AppContextBase.clientAddress}; the runtime supplies it. */
  readonly clientAddress?: string;
  readonly hooks: HookExecutor;
  readonly plugins: PluginRegistry;
  readonly blocks?: BlockRegistry;
  readonly marks?: readonly MarkSpec[];
  readonly shortcodes?: ShortcodeRegistry;
  readonly user?: AuthenticatedUser | null;
  readonly tokenScopes?: readonly string[] | null;
  readonly origin?: EnvInput<string>;
  readonly dev?: DevRuntime;
  readonly logger?: Logger;
  readonly defer?: DeferFn;
  readonly assets?: AssetsBinding;
  readonly storage?: ConnectedObjectStorage;
  readonly cdn?: ConnectedCdn;
  readonly kv?: ConnectedKv;
  readonly imageDelivery?: ImageDelivery;
  readonly authMethods?: AuthMethodsSummary;
  readonly authenticator?: RequestAuthenticator;
  readonly bootstrapAllowed?: boolean;
  /**
   * Without them the context declares the mails of `config` itself and renders
   * against core's catalog alone.
   */
  readonly mails?: DeclaredMails;
  readonly mailCatalogs?: MailCatalogs;
  readonly appContextExtensions?: ReadonlyMap<
    string,
    { readonly value: unknown }
  >;
}

/**
 * A proxy that sets its header blank has reported no address, not an address
 * that is the empty string — the two would otherwise hash to separate buckets.
 */
function normalizeClientAddress(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (trimmed === undefined || trimmed.length === 0) return undefined;
  return trimmed;
}

function logRejection(logger: Logger, error: unknown): void {
  logErrorSafely(logger, "[plumix] deferred promise rejected", error);
}

function wrapDefer(logger: Logger, target: DeferFn | undefined): DeferFn {
  // Runtimes only handle the success path, so rejections are logged here
  // where the operator's logger is known.
  return (promise) => {
    const handled = promise.catch((error: unknown) => {
      logRejection(logger, error);
    });
    if (target === undefined) {
      void handled;
      return;
    }
    target(handled);
  };
}

export function createAppContext<TSchema extends Record<string, unknown>>(
  args: CreateAppContextArgs<TSchema>,
): AppContext<TSchema> {
  const user = args.user ?? null;
  const tokenScopes = args.tokenScopes ?? null;
  const locale = resolveLocale({
    request: args.request,
    user,
    i18n: args.config.i18n,
  });
  const mailer = resolveMailer(args.config.mailer, args.env);
  // The request URL is a fallback for contexts built without an app; it is
  // resolved here because an `(env) => …` origin needs the runtime env.
  const origin =
    args.origin !== undefined
      ? resolveEnvInput(args.origin, args.env)
      : new URL(args.request.url).origin;
  const tracedMailer = mailer && traceMailer(mailer, () => base.telemetry);
  const base: AppContextBase<TSchema> = {
    db: args.db,
    env: args.env,
    request: args.request,
    config: args.config,
    clientAddress: normalizeClientAddress(args.clientAddress),
    user,
    tokenScopes,
    hooks: args.hooks,
    plugins: args.plugins,
    blocks: args.blocks ?? EMPTY_BLOCK_REGISTRY,
    marks: args.marks ?? EMPTY_MARK_LIST,
    shortcodes: args.shortcodes ?? EMPTY_SHORTCODE_REGISTRY,
    logger: args.logger ?? consoleLogger,
    memo: createRequestMemo(),
    auth: {
      can: makeAuthCan(args.plugins, user, tokenScopes),
    },
    defer: wrapDefer(args.logger ?? consoleLogger, args.defer),
    // I/O slots wrapped once here so every consumer gets spans; the getters
    // read `base.telemetry` per call like `fetch` below.
    assets: args.assets && traceAssets(args.assets, () => base.telemetry),
    storage: args.storage && traceStorage(args.storage, () => base.telemetry),
    cdn: args.cdn && traceCdn(args.cdn, () => base.telemetry),
    kv: args.kv && traceKv(args.kv, () => base.telemetry),
    imageDelivery: args.imageDelivery,
    mailer: tracedMailer,
    mail: createMailSender({
      mails:
        args.mails ??
        declareMails({
          plugins: args.config.plugins,
          theme: args.config.theme.mail,
          site: args.config.mail?.overrides,
        }),
      catalogs: args.mailCatalogs ?? CORE_MAIL_CATALOGS_ONLY,
      mailer: tracedMailer,
      // Safety: a site's schema carries core's tables beside its own, and the
      // sender reads only `users`.
      db: args.db as unknown as Db,
      i18n: args.config.i18n,
      locale: locale.code,
      // The magic-link slot names the site; a site without it is named by
      // its host.
      siteName: args.config.auth.magicLink?.siteName ?? new URL(origin).host,
      baseUrl: new URL(`${args.config.basePath}/`, origin).href,
    }),
    locale,
    authMethods: args.authMethods ?? NO_AUTH_METHODS,
    authenticator: args.authenticator ?? defaultAuthenticator(),
    bootstrapAllowed: args.bootstrapAllowed ?? false,
    requestId: crypto.randomUUID(),
    resolvedEntity: null,
    resolvedRoute: null,
    resolvedTemplate: null,
    access: null,
    origin,
    dev: args.dev,
    // Consumers vote on the assembled context, so `telemetry` must exist
    // before the vote; the real collector replaces it below.
    telemetry: NOOP_TELEMETRY,
    // Reads `base.telemetry` per call, so the post-vote collector swap below
    // is observed without rebinding.
    fetch: createTracedFetch(() => base.telemetry),
  };
  if (args.appContextExtensions !== undefined) {
    // Safety: every key that already exists is rejected below, so no declared
    // context field is reachable through this view.
    const target = base as unknown as Record<string, unknown>;
    for (const [key, entry] of args.appContextExtensions) {
      // `extendAppContext` already rejects these; a map built around it must
      // not silently overwrite `db` or `auth`.
      if (key in target) {
        throw ContextError.appContextExtensionShadowsBuiltin(key);
      }
      target[key] = entry.value;
    }
  }
  const ctx = base as AppContext<TSchema>;
  // Safety: `TSchema` reaches only `ctx.db`, which the vote never touches, so
  // the core-schema view drops nothing a consumer reads.
  const coreSchemaView = ctx as unknown as AppContext;
  const sampled = sampleTelemetryConsumers(
    coreSchemaView,
    args.dev,
    args.config.telemetry,
  );
  if (sampled.length > 0) {
    // The context is frozen-by-type, not by object — createAppContext owns
    // construction, so activating the collector post-vote is a private step.
    const mutable = base as {
      telemetry: TelemetryCollector;
      telemetryConsumers?: readonly TelemetryConsumer[];
    };
    mutable.telemetry = createTelemetryCollector();
    mutable.telemetryConsumers = sampled;
  }
  return ctx;
}

/**
 * The history writer registers unconditionally in dev: its readers sit behind
 * separate switches, so gating it on any one of them would starve the rest.
 */
function sampleTelemetryConsumers(
  ctx: AppContext,
  dev: DevRuntime | undefined,
  config: PlumixConfig["telemetry"],
): readonly TelemetryConsumer[] {
  const consumers: TelemetryConsumer[] = [];
  if (process.env.PLUMIX_DEV && dev !== undefined) {
    const bar = debugBarTelemetryConsumer(dev.bar);
    if (bar) consumers.push(bar);
    consumers.push(debugHistoryConsumer(dev.history));
  }
  consumers.push(...(config?.consumers ?? []));
  return consumers.filter((c) => c.sample?.(ctx) ?? true);
}

export const consoleLogger: Logger = {
  debug: (m, meta) => console.debug(m, meta ?? ""),
  info: (m, meta) => console.info(m, meta ?? ""),
  warn: (m, meta) => console.warn(m, meta ?? ""),
  error: (m, meta) => console.error(m, meta ?? ""),
};
