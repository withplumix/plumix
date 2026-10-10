import type { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";

import type { Access } from "../access/contract/access.js";
import type { Capability } from "../access/contract/capability.js";
import type { AuthMethodsSummary } from "../auth/contract/auth-methods.js";
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
import type { MailSender } from "../mail/contract/registry.js";
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

/**
 * Mapped, not `typeof coreSchema`: a namespace type prints in a plugin's
 * declarations as `typeof import("@plumix/core/schema")`, which its consumers
 * cannot resolve; a mapped alias prints by name, through `plumix`.
 */
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
 * Not JSON: the canonical payload is `{ error }` carrying a live `Error`, which
 * a structured backend serializes however it likes.
 */
export type LogMeta = Readonly<Record<string, unknown>>;

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
}

export interface AuthNamespace {
  /**
   * A reference is resolved against this request's registry before the check,
   * so a pooled type's reference meets the namespace its role grants live in.
   */
  can(capability: Capability): boolean;
}

/**
 * Keeps work alive past the response. Never throws; a rejection is logged
 * through `ctx.logger` on every runtime.
 */
export type DeferFn = (promise: Promise<unknown>) => void;

/**
 * Declaration-merge target for helpers a plugin registers with
 * `extendAppContext(key, value)`; augment it so `ctx.<key>` is typed.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AppContextExtensions {}

export interface AppContextBase<
  TSchema extends Record<string, unknown> = CoreSchema,
> {
  readonly db: Db<TSchema>;
  readonly env: PlumixEnv;
  readonly request: Request;
  /** Never serialize it whole: it carries auth providers and mailer secrets. */
  readonly config: PlumixConfig;
  readonly user: AuthenticatedUser | null;
  /**
   * Capability whitelist an authenticator narrowed the request to (an API
   * token's `scopes`); null means the role's caps apply unrestricted.
   */
  readonly tokenScopes: readonly string[] | null;
  /**
   * The address the runtime's trusted proxy reported; core reads no forwarding
   * header itself. Advisory: a fact about the network path, not a principal.
   */
  readonly clientAddress?: string;
  readonly hooks: HookExecutor;
  readonly plugins: PluginRegistry;
  readonly blocks: BlockRegistry;
  readonly marks: readonly MarkSpec[];
  readonly shortcodes: ShortcodeRegistry;
  readonly logger: Logger;
  /**
   * Rejections are not memoized. A tagged entry drops when a write in the same
   * execution announces one of its tags; an untagged one never does.
   */
  readonly memo: RequestMemo;
  /**
   * Always present: {@link NOOP_TELEMETRY} when no consumer sampled the
   * request.
   */
  readonly telemetry: TelemetryCollector;
  /** Traced `fetch`, one span per call; global `fetch` is not patched. */
  readonly fetch: typeof globalThis.fetch;
  /**
   * Consumers whose head-sampling vote said yes for this request — the
   * targets of post-response snapshot delivery. Absent when nothing sampled
   * (and `telemetry` is the no-op). Internal to the dispatcher.
   */
  readonly telemetryConsumers?: readonly TelemetryConsumer[];
  readonly auth: AuthNamespace;
  readonly authenticator: RequestAuthenticator;
  /**
   * Whether external signup flows (magic-link, OAuth, custom guards) may mint
   * the first admin; false leaves passkey as the only rail.
   */
  readonly bootstrapAllowed: boolean;
  readonly authMethods: AuthMethodsSummary;
  readonly defer: DeferFn;
  readonly assets?: AssetsBinding;
  /**
   * Present when the config declared a `storage:` slot and the runtime
   * connected it.
   */
  readonly storage?: ConnectedObjectStorage;
  /** `undefined` means caching is off and every public page renders live. */
  readonly cdn?: ConnectedCdn;
  readonly kv?: ConnectedKv;
  readonly imageDelivery?: ImageDelivery;
  readonly mailer?: Mailer;
  /**
   * Renders in the recipient's locale. Throws `MailerNotConfigured` when there
   * is no mailer, so a feature whose mail is optional catches that.
   */
  readonly mail: MailSender;
  /**
   * Canonical site origin from `auth.passkey.origin`, so composed verification
   * URLs don't depend on which worker served the request.
   */
  readonly origin: string;
  /** Undefined outside the dev gate. */
  readonly dev?: DevRuntime;
  readonly locale: ResolvedLocale;
  /** Set only on the RPC path, by oRPC's `ResponseHeadersPlugin`. */
  readonly resHeaders?: Headers;
  /**
   * Minted per execution (request or cron run); the telemetry snapshot's
   * `requestId`.
   */
  readonly requestId: string;
  /**
   * Mutable: the public-route resolver writes it once before render. `null`
   * on non-public routes.
   */
  resolvedEntity: ResolvedEntity | null;
  /**
   * Written before render, so it stays set on a matched route's 404; `/` for
   * an unclaimed site root, `null` where no content route matched.
   */
  resolvedRoute: ResolvedRoute | null;
  /**
   * The winning rule's `ruleLabel`; `null` before render and where no template
   * renders.
   */
  resolvedTemplate: string | null;
  /**
   * Written after the dispatcher enforces the gate, before render; `null` on
   * an un-policied route and every non-public path.
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
