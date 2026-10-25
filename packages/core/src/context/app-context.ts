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
import type { RendererUser } from "../blocks/renderer/context.js";
import type { StylePolicy } from "../blocks/styles/style-policy.js";
import type { PlumixConfig } from "../config.js";
import type { EditLeaseSurface } from "../db/schema/edit_leases.js";
import type * as coreSchema from "../db/schema/index.js";
import type { SettingsBag } from "../db/schema/settings.js";
import type { UserRole } from "../db/schema/users.js";
import type { AppEvents, AppFilters } from "../hooks/define.js";
import type { HookExecutor } from "../hooks/registry.js";
import type { ResolvedLocale } from "../i18n/locale-registry.js";
import type { JsonValue } from "../json.js";
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
import type { TelemetryDelivery } from "./collector.js";
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

/**
 * Not JSON: drizzle's tables by name. Open, so a database with no schema
 * registered and the test harness's both fit.
 */
type AnySchema = Record<string, unknown>;

/** What a data migration's `up` reshapes: drizzle promising no schema. */
export type DataMigrationDb = Db<AnySchema>;

export interface AuthenticatedUser extends RendererUser {
  readonly role: UserRole;
}

/**
 * The API token a request authenticated with. `id` is the token row's key (the
 * secret's hash), so it identifies the token without recovering the secret.
 */
export interface ApiTokenRef {
  readonly id: string;
  readonly name: string;
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
 * `fetch` bounded by default: a call rejects with a `TimeoutError` after 10s.
 * `timeout` tightens that per call, or `false` lifts it for a long download.
 */
export type PlumixFetch = (
  input: RequestInfo | URL,
  init?: RequestInit & { readonly timeout?: number | false },
) => Promise<Response>;

/** A settings group as a write left it. */
export interface SettingsGroupCopy {
  readonly etag: string;
  readonly values: SettingsBag;
}

/**
 * ADR 0048's guard, for a write made from a copy: the group's `etag` that copy
 * was read at, and who writes it through which surface.
 */
export interface SettingsWriteGuard {
  readonly ifMatch: number;
  readonly takeOver?: boolean;
  readonly writer: {
    readonly userId: number;
    readonly surface: EditLeaseSurface;
  };
}

/**
 * Not JSON yet: a field's pipeline decodes each value, and `null` or
 * `undefined` removes its key.
 */
export type SettingsPatch = Readonly<Record<string, unknown>>;

export interface SettingsNamespace {
  /**
   * Leaves unmentioned keys alone, and fires `settings:group_changed` when
   * anything changed in a public group. Unguarded, it moves the token of a
   * group already saved, unchecked.
   */
  write(
    group: string,
    values: SettingsPatch,
    guard?: SettingsWriteGuard,
  ): Promise<SettingsGroupCopy>;
  /**
   * Stores only the keys `group` does not hold yet, so racing first writers
   * converge on the first; answers the group as it stands.
   */
  writeIfAbsent(
    group: string,
    values: SettingsPatch,
  ): Promise<SettingsGroupCopy>;
  /**
   * Removes every key of `group` holding `value`, in one statement, so a key
   * set to it meanwhile is not missed; answers the group as it stands.
   */
  removeValue(group: string, value: JsonValue): Promise<SettingsGroupCopy>;
}

/**
 * A plugin's own data, in a namespace core names after the calling plugin. A
 * `key` narrows to one item; without one a call covers the whole namespace.
 */
export interface PluginCache {
  /** The current response read this data, so a change to it purges it. */
  reads(key?: string | number): void;
  /**
   * Purges every response that read this data, and drops it from the request
   * memo now.
   */
  changed(key?: string | number): void;
}

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
  /** The API token the request authenticated with; null for any other caller. */
  readonly apiToken: ApiTokenRef | null;
  /**
   * The surface an edit lease taken on this context's behalf records, when it
   * is not the one the credential implies.
   */
  readonly leaseSurface?: EditLeaseSurface;
  /**
   * The address the runtime's trusted proxy reported; core reads no forwarding
   * header itself. Advisory: a fact about the network path, not a principal.
   */
  readonly clientAddress?: string;
  readonly hooks: HookExecutor;
  /** Handlers receive the context `emit` was called on. */
  readonly events: AppEvents;
  /** Handlers receive the context `apply` was called on. */
  readonly filters: AppFilters;
  readonly plugins: PluginRegistry;
  readonly blocks: BlockRegistry;
  /**
   * The names of the blocks the theme allows, resolved at boot by
   * `resolveAllowedBlocks`. Absent allows every block in `blocks`.
   */
  readonly allowedBlocks?: ReadonlySet<string>;
  /**
   * The theme's `allowCustomStyles` with its tokens, which a save's content is
   * checked against. Absent allows custom values everywhere.
   */
  readonly stylePolicy?: StylePolicy;
  readonly marks: readonly MarkSpec[];
  readonly shortcodes: ShortcodeRegistry;
  readonly logger: Logger;
  /**
   * Rejections are not memoized. A tagged entry drops when a write in the same
   * execution announces one of its tags; an untagged one never does.
   */
  readonly memo: RequestMemo;
  /** Throws outside a plugin's code, where there is no namespace to name. */
  readonly cache: PluginCache;
  /**
   * Always present: {@link NOOP_TELEMETRY} when no consumer sampled the
   * request.
   */
  readonly telemetry: TelemetryCollector;
  /** Traced, time-bounded `fetch`, one span per call; global `fetch` is not patched. */
  readonly fetch: PlumixFetch;
  /**
   * Fires when the work this context serves should stop: a scheduled task's
   * budget running out. It never fires on a request or `handler.run`, and
   * `ctx.fetch` follows it.
   */
  readonly signal: AbortSignal;
  /**
   * Consumers whose head-sampling vote said yes for this request — the
   * targets of post-response snapshot delivery. Absent when nothing sampled
   * (and `telemetry` is the no-op). Internal to the dispatcher.
   */
  readonly telemetryConsumers?: readonly TelemetryConsumer[];
  /**
   * What delivering the snapshot reads beyond `telemetry`, present with
   * `telemetryConsumers`. Internal to delivery.
   */
  readonly telemetryDelivery?: TelemetryDelivery;
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
  /** Bound to this context, so subscribers to the write hear its user. */
  readonly settings: SettingsNamespace;
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
