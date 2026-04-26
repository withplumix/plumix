import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import type { KnownCapability } from "../auth/rbac.js";
import type * as coreSchema from "../db/schema/index.js";
import type { UserRole } from "../db/schema/users.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { PluginRegistry } from "../plugin/manifest.js";
import type { PlumixEnv } from "../runtime/bindings.js";
import type {
  AssetsBinding,
  ConnectedObjectStorage,
  ImageDelivery,
} from "../runtime/slots.js";
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
  readonly hooks: HookExecutor;
  readonly plugins: PluginRegistry;
  readonly logger: Logger;
  readonly auth: AuthNamespace;
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
  readonly logger?: Logger;
  readonly after?: AfterResponse;
  readonly assets?: AssetsBinding;
  readonly storage?: ConnectedObjectStorage;
  readonly imageDelivery?: ImageDelivery;
}

const dropPromise: AfterResponse = () => undefined;

export function createAppContext<TSchema extends Record<string, unknown>>(
  args: CreateAppContextArgs<TSchema>,
): AppContext<TSchema> {
  const resolver = createCapabilityResolver(args.plugins);
  const user = args.user ?? null;
  return {
    db: args.db,
    env: args.env,
    request: args.request,
    user,
    hooks: args.hooks,
    plugins: args.plugins,
    logger: args.logger ?? consoleLogger,
    auth: {
      can: (capability) =>
        user !== null && resolver.hasCapability(user.role, capability),
    },
    after: args.after ?? dropPromise,
    assets: args.assets,
    storage: args.storage,
    imageDelivery: args.imageDelivery,
  };
}

export function withUser<TSchema extends Record<string, unknown>>(
  ctx: AppContext<TSchema>,
  user: AuthenticatedUser,
): AuthenticatedAppContext<TSchema> {
  const resolver = createCapabilityResolver(ctx.plugins);
  return {
    ...ctx,
    user,
    auth: {
      can: (capability) => resolver.hasCapability(user.role, capability),
    },
  };
}

export const consoleLogger: Logger = {
  debug: (m, meta) => console.debug(m, meta ?? ""),
  info: (m, meta) => console.info(m, meta ?? ""),
  warn: (m, meta) => console.warn(m, meta ?? ""),
  error: (m, meta) => console.error(m, meta ?? ""),
};
