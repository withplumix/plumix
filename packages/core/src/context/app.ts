import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import type { RequestAuthenticator } from "../auth/authenticator.js";
import type { Mailer } from "../auth/mailer/types.js";
import type { KnownCapability } from "../auth/rbac.js";
import type * as coreSchema from "../db/schema/index.js";
import type { UserRole } from "../db/schema/users.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { ResolvedEntity } from "../route/current.js";
import type { OAuthProviderSummary } from "../runtime/app.js";
import type { PlumixEnv } from "../runtime/bindings.js";
import type {
  AssetsBinding,
  ConnectedObjectStorage,
  ImageDelivery,
} from "../runtime/slots.js";
import { defaultAuthenticator } from "../auth/authenticator.js";
import { createCapabilityResolver } from "../auth/rbac.js";

export type CoreSchema = typeof coreSchema;

export type Db<TSchema extends Record<string, unknown> = CoreSchema> =
  BaseSQLiteDatabase<"async" | "sync", unknown, TSchema>;

export interface AuthenticatedUser {
  readonly id: number;
  readonly email: string;
  readonly role: UserRole;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

export interface AuthNamespace {
  // Literal union gives autocomplete for known capabilities (core + derived
  // `${type}:${action}` shapes); `string & {}` keeps arbitrary plugin-defined
  // capability strings accepted at runtime without a cast.
  can(capability: KnownCapability | (string & {})): boolean;
}

export type AfterResponse = (promise: Promise<unknown>) => void;

export interface AppContext<
  TSchema extends Record<string, unknown> = CoreSchema,
> {
  readonly db: Db<TSchema>;
  readonly env: PlumixEnv;
  readonly request: Request;
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
  readonly hooks: HookExecutor;
  readonly plugins: PluginRegistry;
  readonly logger: Logger;
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
   * Configured OAuth providers — `{ key, label }` per entry. Empty when
   * the deploy is passkey-only. Read by the login screen (via the
   * `auth.oauthProviders` RPC) to render provider buttons; client
   * credentials never reach this surface.
   */
  readonly oauthProviders: readonly OAuthProviderSummary[];
  /**
   * Extend work past the returned Response. Runtime adapters bind this
   * to their platform primitive (CF Workers: `ExecutionContext.waitUntil`).
   * Default: fire-and-forget — handlers must tolerate the promise being
   * dropped on runtimes that opt out.
   */
  readonly after: AfterResponse;
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
   * On-the-fly image delivery (resize / format / quality URLs). Present
   * when the config declared an `imageDelivery:` slot. Pure URL math —
   * `imageDelivery.url(src, opts)` returns the CDN-transformed URL.
   * Plugins that render images (media plugin, themes) read this; core
   * procedures don't use it today.
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
   * Operator-set site name from `auth.magicLink.siteName`, used as
   * the human-friendly label in mailer subjects ("Confirm your email
   * for {siteName}"). Undefined when magic-link isn't configured —
   * RPC procedures that compose user-facing mail should refuse with
   * a config-missing reason in that case.
   */
  readonly siteName?: string;
  /**
   * Set by the public-route resolver after URL → entity matching;
   * `null` for non-public routes (admin, RPC, etc.) and on cold-start.
   * Consumers (breadcrumbs, canonical tags, menu plugin's `isCurrent`)
   * read this to answer "is this the entity we're currently rendering."
   * Mutable by design — the resolver writes once between cookie auth
   * and response rendering, and read paths see the populated value.
   */
  resolvedEntity: ResolvedEntity | null;
}

export type AuthenticatedAppContext<
  TSchema extends Record<string, unknown> = CoreSchema,
> = Omit<AppContext<TSchema>, "user"> & {
  readonly user: AuthenticatedUser;
};

export interface CreateAppContextArgs<TSchema extends Record<string, unknown>> {
  readonly db: Db<TSchema>;
  readonly env: PlumixEnv;
  readonly request: Request;
  readonly hooks: HookExecutor;
  readonly plugins: PluginRegistry;
  readonly user?: AuthenticatedUser | null;
  readonly tokenScopes?: readonly string[] | null;
  readonly origin?: string;
  readonly siteName?: string;
  readonly logger?: Logger;
  readonly after?: AfterResponse;
  readonly assets?: AssetsBinding;
  readonly storage?: ConnectedObjectStorage;
  readonly imageDelivery?: ImageDelivery;
  readonly mailer?: Mailer;
  readonly oauthProviders?: readonly OAuthProviderSummary[];
  readonly authenticator?: RequestAuthenticator;
  readonly bootstrapAllowed?: boolean;
}

const dropPromise: AfterResponse = () => undefined;

function makeAuthCan(
  resolver: ReturnType<typeof createCapabilityResolver>,
  user: AuthenticatedUser | null,
  tokenScopes: readonly string[] | null,
): (capability: string) => boolean {
  if (user === null) return () => false;
  if (tokenScopes === null) {
    return (capability) => resolver.hasCapability(user.role, capability);
  }
  // Pre-build the Set so each can() call is O(1) instead of O(scopes).
  // Token-authed requests are the hot path; the Set is per-request,
  // tiny, and sees ≥1 lookups per request typically.
  const scopeSet = new Set(tokenScopes);
  return (capability) =>
    scopeSet.has(capability) && resolver.hasCapability(user.role, capability);
}

export function createAppContext<TSchema extends Record<string, unknown>>(
  args: CreateAppContextArgs<TSchema>,
): AppContext<TSchema> {
  const resolver = createCapabilityResolver(args.plugins);
  const user = args.user ?? null;
  const tokenScopes = args.tokenScopes ?? null;
  return {
    db: args.db,
    env: args.env,
    request: args.request,
    user,
    tokenScopes,
    hooks: args.hooks,
    plugins: args.plugins,
    logger: args.logger ?? consoleLogger,
    auth: {
      can: makeAuthCan(resolver, user, tokenScopes),
    },
    after: args.after ?? dropPromise,
    assets: args.assets,
    storage: args.storage,
    imageDelivery: args.imageDelivery,
    mailer: args.mailer,
    oauthProviders: args.oauthProviders ?? [],
    authenticator: args.authenticator ?? defaultAuthenticator(),
    bootstrapAllowed: args.bootstrapAllowed ?? false,
    resolvedEntity: null,
    // Best-effort fallback for tests / runtimes that don't pass an
    // explicit origin: derive from the inbound request URL. Production
    // always passes the canonical operator-set origin so URLs in
    // outgoing email are stable across worker geos.
    origin: args.origin ?? new URL(args.request.url).origin,
    siteName: args.siteName,
  };
}

export function withUser<TSchema extends Record<string, unknown>>(
  ctx: AppContext<TSchema>,
  user: AuthenticatedUser,
  tokenScopes: readonly string[] | null = null,
): AuthenticatedAppContext<TSchema> {
  const resolver = createCapabilityResolver(ctx.plugins);
  return {
    ...ctx,
    user,
    tokenScopes,
    auth: {
      can: makeAuthCan(resolver, user, tokenScopes),
    },
    oauthProviders: ctx.oauthProviders,
  };
}

export const consoleLogger: Logger = {
  debug: (m, meta) => console.debug(m, meta ?? ""),
  info: (m, meta) => console.info(m, meta ?? ""),
  warn: (m, meta) => console.warn(m, meta ?? ""),
  error: (m, meta) => console.error(m, meta ?? ""),
};
