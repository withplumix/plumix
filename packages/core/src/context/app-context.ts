import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import type { Access } from "../access/contract/access.js";
import type { AuthMethodsSummary } from "../auth/contract/auth-methods.js";
import type { Capability } from "../auth/contract/capability.js";
import type { Mailer } from "../auth/contract/mailer.js";
import type {
  BlockRegistry,
  MarkSpec,
  ShortcodeRegistry,
} from "../blocks/index.js";
import type { PlumixConfig } from "../config.js";
import type * as coreSchema from "../db/schema/index.js";
import type { UserRole } from "../db/schema/users.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { ResolvedLocale } from "../i18n/locale-registry.js";
import type { JsonObject } from "../json.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { ResolvedEntity } from "../route/contract/resolved-entity.js";
import type { ResolvedRoute } from "../route/contract/resolved-route.js";
import type { PlumixEnv } from "../runtime/contract/bindings.js";
import type {
  AssetsBinding,
  ConnectedCdn,
  ConnectedKv,
  ConnectedObjectStorage,
  ImageDelivery,
} from "../runtime/contract/slots.js";
import type { RequestAuthenticator } from "./authenticator.js";
import type { DevRuntime } from "./dev-runtime.js";
import type { RequestMemo } from "./memo.js";
import type { TelemetryCollector, TelemetryConsumer } from "./telemetry.js";

// Mapped, not `typeof coreSchema`: a namespace type prints in a plugin's
// declarations as `typeof import("@plumix/core/schema")`, which its consumers
// cannot resolve; a mapped alias prints by name, through `plumix`.
export type CoreSchema = {
  [Table in keyof typeof coreSchema]: (typeof coreSchema)[Table];
};

export type Db<TSchema extends Record<string, unknown> = CoreSchema> =
  BaseSQLiteDatabase<"async" | "sync", unknown, TSchema>;

export interface AuthenticatedUser {
  readonly id: number;
  readonly email: string;
  /** Display name from `users.name`; null when the user never set one. */
  readonly name?: string | null;
  readonly role: UserRole;
  /** The stored `users.meta` bag, verbatim — this projection never runs the
   *  field pipeline, so it is the column's own {@link JsonObject}, not the
   *  hydrated `ResolvedMeta` the RPC read surfaces return. */
  readonly meta: JsonObject;
}

/**
 * Structured context attached to a log line. Not JSON: the canonical payload
 * is `{ error }` carrying a live `Error` with its stack, and a structured
 * backend is expected to serialize it however it likes.
 */
export type LogMeta = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

export interface AuthNamespace {
  // A reference is resolved against this request's registry before the check,
  // so a pooled type's reference meets the namespace its role grants live in.
  can(capability: Capability): boolean;
}

/**
 * Schedule fire-and-forget work whose result the caller doesn't await.
 * Runtime adapters bind this to their platform primitive:
 *
 * - Cloudflare Workers: `executionCtx.waitUntil(promise)` — extends
 *   the worker's lifetime past the response so background work
 *   completes before the isolate is recycled.
 * - Long-lived runtimes (Node, Bun): the invocation carries no
 *   `waitUntil`, so the default handler tracks the promise in a pending
 *   set that `handler.dispose()` drains on shutdown — the work outlives
 *   the response without being lost at `SIGTERM`.
 * - Test runtimes: a queue + `drainDeferred()` helper for harness
 *   assertions on background work.
 * - A context built with no `defer` at all (a harness, a narrow unit
 *   test): `void p.catch(...)`, so the event loop holds the promise and
 *   a rejection is logged rather than crashing the process.
 *
 * `defer` itself never throws — pass any promise, log-and-forget is
 * the contract. Rejection logging always routes through `ctx.logger`
 * so an operator-wired logger sees deferred rejections regardless of
 * which runtime is underneath.
 */
export type DeferFn = (promise: Promise<unknown>) => void;

/**
 * Declaration-merge target for plugin-contributed AppContext helpers.
 * `extendAppContext(key, value)` registers an entry; the dispatcher
 * merges entries onto each per-request `AppContext` so handlers (RPC,
 * route, hook listeners) read them via `ctx.<key>`.
 *
 * Empty by default — plugins augment via TypeScript module merging,
 * mirroring `PluginContextExtensions`.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppContextExtensions {}

export interface AppContextBase<
  TSchema extends Record<string, unknown> = CoreSchema,
> {
  readonly db: Db<TSchema>;
  readonly env: PlumixEnv;
  readonly request: Request;
  /**
   * The app's resolved config — the same object as `app.config`. A value the
   * operator wrote in `plumix.config.ts` is read here (`ctx.config.basePath`,
   * `ctx.config.i18n`) and never copied onto the context, so a new slot reaches
   * every handler without threading (ADR 0011). A slot that binds to the
   * platform is also connected as a service (`ctx.storage`). Never serialize
   * it whole: it carries auth providers and mailer secrets.
   */
  readonly config: PlumixConfig;
  readonly user: AuthenticatedUser | null;
  /**
   * Per-request capability whitelist when the active authenticator
   * narrowed it (e.g. an API token with `scopes: [...]`). null =
   * unrestricted, the user's role caps apply verbatim. `auth.can()`
   * intersects this with the role caps; every capability check in
   * core + plugins reads through `auth.can`, so nothing escapes the
   * narrowing.
   */
  readonly tokenScopes: readonly string[] | null;
  /**
   * The client address the runtime's trusted proxy reported, as
   * `invocation.clientAddress` supplied it; `undefined` when the runtime
   * resolved none. Core derives it from no forwarding header — only the
   * adapter knows which proxy in front of it is trusted — so a plugin writing
   * a rate limiter reads this one field whatever the site deploys on.
   *
   * Advisory, like the session row it lands in: an address is a fact about the
   * network path, not a principal. Policy still flows through the session id.
   */
  readonly clientAddress?: string;
  readonly hooks: HookExecutor;
  readonly plugins: PluginRegistry;
  /**
   * Merged block / mark registries — same instances `buildApp` built
   * at boot. RPC procedures consume these for server-side content
   * validation before persistence. Plugin route handlers can also read
   * them to render entry content.
   */
  readonly blocks: BlockRegistry;
  readonly marks: readonly MarkSpec[];
  /**
   * Merged shortcode registry (same instance `buildApp` built). The
   * public render path reads it for entry-title and rich-text body
   * expansion.
   */
  readonly shortcodes: ShortcodeRegistry;
  readonly logger: Logger;
  /**
   * Request-scoped read-through memo for repeated reads (issue #1493).
   * `memo(key, load)` runs `load` once per key per request and replays
   * the settled value to later callers — hot single-row lookups
   * (settings group, author row, entry type, menu cluster) dedupe
   * inside the service functions without new API surface. The cache
   * dies with the context; rejections are not memoized. A tagged entry
   * drops when a write in the same execution announces one of its tags;
   * an untagged one never does. `withUser` derivations share it — see the
   * contract notes on {@link RequestMemo}.
   */
  readonly memo: RequestMemo;
  /**
   * Request-scoped telemetry collector — spans + records for what happened
   * during this request. Core and plugins record via `ctx.telemetry.record`/
   * `span`. Always present: the real collector when at least one registered
   * consumer voted to sample this request, {@link NOOP_TELEMETRY} otherwise
   * (so call sites are safe and a site with no consumers pays nothing).
   */
  readonly telemetry: TelemetryCollector;
  /**
   * Traced outbound HTTP — same signature as global `fetch`, one telemetry
   * span per call with method, URL, and response status. Core and plugins
   * make external calls through this so a slow third-party API shows up in
   * the request waterfall. Bare global `fetch` is an untraced platform
   * boundary (the same line drawn for DB connections not obtained from
   * `ctx.db`) — nothing is patched globally.
   */
  readonly fetch: typeof globalThis.fetch;
  /**
   * Consumers whose head-sampling vote said yes for this request — the
   * targets of post-response snapshot delivery. Absent when nothing sampled
   * (and `telemetry` is the no-op). Internal to the dispatcher.
   */
  readonly telemetryConsumers?: readonly TelemetryConsumer[];
  readonly auth: AuthNamespace;
  /**
   * Resolved request authenticator — same instance the dispatcher
   * uses. RPC middleware (`authenticated`) reads it from here so a
   * custom guard (e.g. CF Access JWT) gates RPC calls the same way it
   * gates routes. Plugin route handlers read it for the same reason.
   */
  readonly authenticator: RequestAuthenticator;
  /**
   * Whether external signup flows (magic-link, OAuth, custom guards)
   * are allowed to mint the very first admin. Derived from
   * `auth.bootstrapVia`; defaults to false (passkey-only rail).
   */
  readonly bootstrapAllowed: boolean;
  /**
   * Configured auth methods, fed to the render provider so a theme's own login
   * page reads them via `useAuthMethods()`, and to the admin login through the
   * `auth.signInMethods` RPC. See {@link AuthMethodsSummary}.
   */
  readonly authMethods: AuthMethodsSummary;
  /**
   * Extend work past the returned Response — see `DeferFn` for the
   * full per-runtime contract. Default fallback (long-lived runtimes,
   * tests with no adapter wired) catches rejections and logs them
   * via `ctx.logger.error` so a fire-and-forget plugin task can't
   * crash the process on an unhandled rejection.
   */
  readonly defer: DeferFn;
  /**
   * Platform asset serving, when the runtime exposes one. Populated by
   * the CF adapter from `env.ASSETS`; undefined on runtimes without an
   * asset layer. Consumed by the dispatcher to serve admin SPA deep-links.
   */
  readonly assets?: AssetsBinding;
  /**
   * Bound object storage for this request. Present when the config
   * declared a `storage:` slot and the runtime adapter connected it.
   * Plugin handlers (e.g. media upload finalization) read/write via
   * this; core procedures don't use it today.
   */
  readonly storage?: ConnectedObjectStorage;
  /**
   * Bound CDN for this request, when the config declared a `cdn:`
   * slot and the runtime connected it (zone credentials present). The
   * dispatcher's public-route path reads/writes through this; `undefined`
   * means caching is off and every public page renders live.
   */
  readonly cdn?: ConnectedCdn;
  /**
   * Bound key/value store for this request, when the config declared a `kv:`
   * slot and the runtime adapter connected it. Plugin handlers read/write via
   * this; core procedures don't use it today.
   */
  readonly kv?: ConnectedKv;
  /**
   * On-the-fly image delivery (resize / format / quality URLs). Present
   * when the config declared an `imageDelivery:` slot, already resolved
   * against the request env by the runtime. `imageDelivery.url(src, opts)`
   * returns the CDN-transformed URL. Plugins that render images (media
   * plugin, themes) read this; core procedures don't use it today.
   */
  readonly imageDelivery?: ImageDelivery;
  /**
   * Configured outbound email transport. Present when the operator
   * passed `mailer:` at the top of `plumix({...})`. Magic-link reads
   * this; future invite-email / password-reset / plugin-defined
   * notifications read the same instance — operators configure once,
   * every feature reuses. Plugin handlers should null-check and
   * degrade if mail is optional for their feature.
   */
  readonly mailer?: Mailer;
  /**
   * Canonical site origin (`https://cms.example.com`). Sourced from
   * `auth.passkey.origin` at app build time. Magic-link, email-change,
   * and any future flow that composes a verification URL reads this
   * so URLs are stable across the deployment regardless of which
   * worker / region serves the inbound request.
   */
  readonly origin: string;
  /**
   * The app's resolved dev config — the bar, the panel set and the
   * request-history ring — or undefined outside the dev gate. Handed down
   * rather than imported so every reader shares the instance the app built
   * (#2442). The raw input is `config.dev`.
   */
  readonly dev?: DevRuntime;
  readonly locale: ResolvedLocale;
  /**
   * Response headers writable from inside an RPC procedure. Populated by
   * `@orpc/server/plugins`'s `ResponseHeadersPlugin` at handle-time, so
   * outside the RPC path this is undefined. Procedures append `Set-Cookie`
   * / custom headers here; the dispatcher folds them into the Response.
   */
  readonly resHeaders?: Headers;
  /**
   * Unique id for this execution (request or cron run), minted at context
   * creation so mid-request consumers — logs, error hooks, the debug bar —
   * and the post-response telemetry snapshot all correlate on one value.
   * The snapshot envelope's `requestId` is this id.
   */
  readonly requestId: string;
  /**
   * Set by the public-route resolver after URL → entity matching;
   * `null` for non-public routes (admin, RPC, etc.) and on cold-start.
   * Consumers (breadcrumbs, canonical tags, menu plugin's `isCurrent`)
   * read this to answer "is this the entity we're currently rendering."
   * Mutable by design — the resolver writes once between cookie auth
   * and response rendering, and read paths see the populated value.
   */
  resolvedEntity: ResolvedEntity | null;
  /**
   * The content route this public request matched — its declared pattern and
   * captured params — written by the public-route resolver before it renders,
   * so it stays set on the 404 a matched route's resolver answers; `/` for the
   * site root no route claimed, and `null` on every path the content router
   * did not match. A render-time consumer reads it to address the
   * page's own URL space from the params that produced the page, rather than
   * re-matching the URL. Same write-once-mutable design as `resolvedEntity`.
   */
  resolvedRoute: ResolvedRoute | null;
  /**
   * The template rule that won resolution (its `ruleLabel`), written by the
   * theme renderer once a rule matches; `null` before render and on paths
   * that never render a template. Same write-once-mutable design as
   * `resolvedEntity` — the resolve phase span reads it back post-render.
   */
  resolvedTemplate: string | null;
  /**
   * The resolved access decision for a policied public route — its `segment`
   * and `gate` — written by the dispatcher after it enforces the gate, before
   * the render. `null` on an un-policied route (the global `anonymous` default)
   * and every non-public path. A theme template reads this to branch a soft
   * gate: a `challenge` gate means serve the teaser variant, `allow` the full
   * render. Same write-once-mutable design as `resolvedEntity`.
   */
  access: Access | null;
}

export type AppContext<TSchema extends Record<string, unknown> = CoreSchema> =
  AppContextBase<TSchema> & AppContextExtensions;

export type AuthenticatedAppContext<
  TSchema extends Record<string, unknown> = CoreSchema,
> = Omit<AppContext<TSchema>, "user"> & {
  readonly user: AuthenticatedUser;
};
