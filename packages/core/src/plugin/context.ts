import type { DerivedCapability } from "../auth/rbac.js";
import type { AppContext, AppContextExtensions } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import type { HookRegistry } from "../hooks/registry.js";
import type {
  ActionArgs,
  ActionFn,
  ActionName,
  FilterFn,
  FilterInput,
  FilterName,
  FilterRest,
  HookOptions,
} from "../hooks/types.js";
import type { RouteIntent } from "../route/intent.js";
import type { LookupAdapterOptions } from "./lookup.js";
import type {
  AdminPageOptions,
  EntryMetaBoxOptions,
  EntryTypeOptions,
  FieldTypeOptions,
  LoginLinkOptions,
  MetaBoxField,
  MutablePluginRegistry,
  PluginRouteAuth,
  PluginRouteMethod,
  PluginRpcRouter,
  ScheduledTask,
  SettingsGroupOptions,
  SettingsPageOptions,
  TermMetaBoxOptions,
  TermTaxonomyOptions,
  UserMetaBoxOptions,
} from "./manifest.js";
import {
  deriveEntryTypeCapabilities,
  deriveTermTaxonomyCapabilities,
} from "../auth/rbac.js";
import { DEFAULT_REWRITE_RULE_PRIORITY } from "../route/compile.js";
import { MAX_PLUGIN_ID_LENGTH, PLUGIN_ID_RE } from "./define.js";
import { PluginContextError } from "./errors.js";
import { CORE_RPC_NAMESPACES, DuplicateRegistrationError } from "./manifest.js";

export interface ContextExtensionEntry {
  readonly value: unknown;
  readonly pluginId: string;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PluginContextExtensions {}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ThemeContextExtensions {}

export interface PluginProvidesContext {
  readonly id: string;
  extendPluginContext<TKey extends keyof PluginContextExtensions>(
    key: TKey,
    value: PluginContextExtensions[TKey],
  ): void;
  extendThemeContext<TKey extends keyof ThemeContextExtensions>(
    key: TKey,
    value: ThemeContextExtensions[TKey],
  ): void;
  /**
   * Register a runtime helper on every per-request `AppContext`. Reads
   * are typed via the `AppContextExtensions` declaration-merge target —
   * a plugin augments it once and `ctx.<key>` is autocompleted in
   * every RPC/route/hook handler. Duplicate keys throw.
   */
  extendAppContext<TKey extends keyof AppContextExtensions>(
    key: TKey,
    value: AppContextExtensions[TKey],
  ): void;
}

export interface PluginSetupContextBase {
  readonly id: string;

  /** Subscribe to an existing (core or other-plugin) filter. */
  addFilter<TName extends FilterName>(
    name: TName,
    fn: FilterFn<TName>,
    options?: HookOptions,
  ): void;

  /** Subscribe to an existing (core or other-plugin) action. */
  addAction<TName extends ActionName>(
    name: TName,
    fn: ActionFn<TName>,
    options?: HookOptions,
  ): void;

  /**
   * Declare a plugin-owned filter. The short name is auto-prefixed with the
   * plugin id — `ctx.registerFilter('meta_tags', ...)` becomes `<plugin>:meta_tags`.
   * Other plugins listen via the full prefixed name.
   */
  registerFilter<TName extends FilterName>(
    shortName: string,
    fn: FilterFn<TName>,
    options?: HookOptions,
  ): void;

  registerAction<TName extends ActionName>(
    shortName: string,
    fn: ActionFn<TName>,
    options?: HookOptions,
  ): void;

  registerEntryType(name: string, options: EntryTypeOptions): void;
  registerTermTaxonomy(name: string, options: TermTaxonomyOptions): void;
  /**
   * Declare a meta box on the entry editor sidebar. The fields inside
   * the box drive both the admin input rendering and the server-side
   * storage schema (type + sanitize) — there is no separate
   * `registerMeta` step. Throws `DuplicateRegistrationError` on id
   * collision; `buildManifest` rejects two boxes writing to the same
   * `(entryType, field.key)` pair.
   */
  registerEntryMetaBox(id: string, options: EntryMetaBoxOptions): void;
  /**
   * Same model as `registerEntryMetaBox`, but scoped to termTaxonomies and
   * rendered on the term edit form as one stacked shadcn `<Card>` per
   * box. `registerTermMeta` is not a separate step — the box's fields
   * are the meta key contract.
   */
  registerTermMetaBox(id: string, options: TermMetaBoxOptions): void;

  /**
   * Same model as `registerEntryMetaBox`, but rendered on the user
   * edit form. Users have a flat meta keyspace (no scope property) —
   * all registered boxes target every user; use `capability` to gate
   * which boxes the viewer sees.
   */
  registerUserMetaBox(id: string, options: UserMetaBoxOptions): void;
  registerCapability(name: string, minRole: UserRole): void;
  registerCapability(
    name: string,
    options: {
      readonly minRole: UserRole;
      readonly defaultGrants?: readonly UserRole[];
    },
  ): void;

  /**
   * Declare a standalone settings group — a storage unit (fields land
   * under `settings(group.name, field.name)`) and a visual unit
   * (rendered as one shadcn `<Card>` in the admin with its own save
   * button in the card footer). Throws `DuplicateRegistrationError` if
   * another plugin already registered the same name. Reference the
   * group from one or more `registerSettingsPage` calls to surface it
   * in the admin.
   */
  registerSettingsGroup(name: string, options: SettingsGroupOptions): void;

  /**
   * Declare a settings page (admin URL `/settings/<name>`) that
   * composes one or more registered groups. Pages are pure admin-UI
   * metadata — they aren't stored. Throws
   * `DuplicateRegistrationError` on name collision; group references
   * are validated at manifest-build time (`buildManifest`), not here,
   * so plugin install order doesn't matter.
   */
  registerSettingsPage(name: string, options: SettingsPageOptions): void;

  /**
   * Declare a public URL → `RouteIntent` mapping. Lands in the compiled
   * route map at `buildApp`; `URLPattern` pathname syntax (e.g. `/:slug`,
   * `/docs/:category/:slug`). `priority` defaults to 10 — lower wins,
   * auto-generated archive/single rules from `registerEntryType` sit at 50.
   */
  registerRewriteRule(
    pattern: string,
    intent: RouteIntent,
    options?: { readonly priority?: number },
  ): void;

  /** Mounted at `/_plumix/rpc/<pluginId>/*`. */
  registerRpcRouter(router: PluginRpcRouter): void;

  /** Mounted at `/_plumix/<pluginId><path>`. CSRF is enforced by the dispatcher. */
  registerRoute(options: {
    readonly method: PluginRouteMethod;
    readonly path: string;
    readonly auth: PluginRouteAuth;
    readonly handler: (
      request: Request,
      ctx: AppContext,
    ) => Response | Promise<Response>;
  }): void;

  registerAdminPage(options: AdminPageOptions): void;
  registerFieldType(options: FieldTypeOptions): void;
  /**
   * Register a `LookupAdapter` for a reference target kind. The
   * `kind` matches the `referenceTarget.kind` carried on a reference
   * field's manifest entry; core ships adapters for `entry` /
   * `term` / `user`, and plugins can add more (`media` from
   * `@plumix/plugin-media`, future `comment` from a comments plugin,
   * etc.). Duplicate kinds throw.
   */
  registerLookupAdapter(options: LookupAdapterOptions): void;

  /**
   * Surface a button on the standard login screen pointing at this
   * plugin's sign-in flow. The actual flow lives in routes the plugin
   * registers separately (`registerRoute("/start", …)`,
   * `registerRoute("/callback", …)`); this just gives the existing
   * login UI a button to render. Mirrors how `auth.oauth.providers`
   * surfaces OAuth buttons, but for plugin-shipped flows that aren't
   * OAuth-shaped (SAML, custom SSO).
   */
  registerLoginLink(options: LoginLinkOptions): void;

  /**
   * Register periodic work that fires on the runtime's scheduled
   * trigger (Cloudflare cron). The handler receives a synthetic-
   * request `AppContext` — `user` is `null`, `request` is an internal
   * marker, all other fields (`db`, `hooks`, `logger`, `defer`) match
   * a normal request.
   *
   * `id` must be unique within the plugin. v1 dispatch fires ALL
   * registered tasks on every scheduled invocation regardless of
   * `cron`; per-task cron filtering is a follow-up.
   */
  registerScheduledTask(task: ScheduledTask): void;
}

export type PluginSetupContext = PluginSetupContextBase &
  PluginContextExtensions;

interface CreatePluginContextArgs {
  readonly pluginId: string;
  readonly hooks: HookRegistry;
  readonly registry: MutablePluginRegistry;
  readonly extensions?: ReadonlyMap<string, unknown>;
}

interface CreateProvidesContextArgs {
  readonly pluginId: string;
  readonly pluginExtensions: Map<string, ContextExtensionEntry>;
  readonly themeExtensions: Map<string, ContextExtensionEntry>;
  readonly appExtensions: Map<string, ContextExtensionEntry>;
}

// Names that would corrupt the per-request `AppContext` if a plugin
// tried to register them. `__proto__` triggers the Object.prototype
// setter and reparents the ctx; `constructor` / `prototype` shadow
// inherited members and confuse downstream introspection.
const RESERVED_EXTENSION_KEYS: ReadonlySet<string> = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

// Built-in `AppContextBase` members. extendAppContext rejects these so
// a plugin can't silently replace `db`, `auth`, etc. at request time.
// Mirrors the `key in target` shadow check `extendPluginContext`
// runs against the constructed PluginSetupContext at install.
const APP_CONTEXT_BASE_KEYS: ReadonlySet<string> = new Set([
  "db",
  "env",
  "request",
  "user",
  "tokenScopes",
  "hooks",
  "plugins",
  "logger",
  "auth",
  "authenticator",
  "bootstrapAllowed",
  "oauthProviders",
  "after",
  "assets",
  "storage",
  "imageDelivery",
  "mailer",
  "origin",
  "siteName",
  "resolvedEntity",
]);

export function createPluginProvidesContext({
  pluginId,
  pluginExtensions,
  themeExtensions,
  appExtensions,
}: CreateProvidesContextArgs): PluginProvidesContext {
  const stash = (
    target: Map<string, ContextExtensionEntry>,
    kind: "Plugin" | "Theme" | "App",
    key: string,
    value: unknown,
  ): void => {
    if (typeof key !== "string" || key.length === 0) {
      throw PluginContextError.extendContextInvalidKey({ pluginId, kind });
    }
    if (RESERVED_EXTENSION_KEYS.has(key)) {
      throw PluginContextError.extendContextReservedKey({
        pluginId,
        kind,
        key,
      });
    }
    if (kind === "App" && APP_CONTEXT_BASE_KEYS.has(key)) {
      throw PluginContextError.extendAppContextBuiltinCollision({
        pluginId,
        key,
      });
    }
    const existing = target.get(key);
    if (existing) {
      throw PluginContextError.extendContextDuplicate({
        pluginId,
        kind,
        key,
        existingOwner: existing.pluginId,
      });
    }
    target.set(key, { value, pluginId });
  };
  return {
    id: pluginId,
    extendPluginContext: (key, value) => {
      stash(pluginExtensions, "Plugin", key, value);
    },
    extendThemeContext: (key, value) => {
      stash(themeExtensions, "Theme", key, value);
    },
    extendAppContext: (key, value) => {
      stash(appExtensions, "App", key, value);
    },
  };
}

export function createPluginSetupContext({
  pluginId,
  hooks,
  registry,
  extensions,
}: CreatePluginContextArgs): PluginSetupContext {
  // Pooling caps by capabilityType is safe when minRoles agree; if one
  // type applies a `capabilities` override and another doesn't, silent
  // first-writer-wins would tie the resolved cap to registration order.
  const addDerivedCaps = (caps: readonly DerivedCapability[]): void => {
    for (const cap of caps) {
      const existing = registry.capabilities.get(cap.name);
      if (existing) {
        if (existing.minRole !== cap.minRole) {
          throw PluginContextError.derivedCapabilityMinRoleMismatch({
            pluginId,
            capName: cap.name,
            minRole: cap.minRole,
            existingMinRole: existing.minRole,
            existingOwner: existing.registeredBy ?? "<unknown>",
          });
        }
        continue;
      }
      registry.capabilities.set(cap.name, { ...cap, registeredBy: pluginId });
    }
  };

  const ctx: PluginSetupContextBase = {
    id: pluginId,

    addFilter: (name, fn, options) => {
      hooks.addFilter(name, fn, { ...options, plugin: pluginId });
    },

    addAction: (name, fn, options) => {
      hooks.addAction(name, fn, { ...options, plugin: pluginId });
    },

    registerFilter: (shortName, fn, options) => {
      const prefixed = `${pluginId}:${shortName}` as FilterName;
      hooks.addFilter(prefixed, fn as FilterFn<FilterName>, {
        ...options,
        plugin: pluginId,
      });
    },

    registerAction: (shortName, fn, options) => {
      const prefixed = `${pluginId}:${shortName}` as ActionName;
      hooks.addAction(prefixed, fn, {
        ...options,
        plugin: pluginId,
      });
    },

    registerEntryType: (name, options) => {
      if (registry.entryTypes.has(name))
        throw new DuplicateRegistrationError("entry type", name);
      registry.entryTypes.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
      addDerivedCaps(deriveEntryTypeCapabilities(name, options));
    },

    registerTermTaxonomy: (name, options) => {
      if (registry.termTaxonomies.has(name))
        throw new DuplicateRegistrationError("termTaxonomy", name);
      registry.termTaxonomies.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
      addDerivedCaps(deriveTermTaxonomyCapabilities(name, options));
    },

    registerEntryMetaBox: makeMetaBoxRegistrar(
      registry.entryMetaBoxes,
      "entry meta box",
      pluginId,
    ),
    registerTermMetaBox: makeMetaBoxRegistrar(
      registry.termMetaBoxes,
      "term meta box",
      pluginId,
    ),
    registerUserMetaBox: makeMetaBoxRegistrar(
      registry.userMetaBoxes,
      "user meta box",
      pluginId,
    ),

    registerCapability: (
      name: string,
      minRoleOrOptions:
        | UserRole
        | { minRole: UserRole; defaultGrants?: readonly UserRole[] },
    ) => {
      if (registry.capabilities.has(name)) {
        throw new DuplicateRegistrationError("capability", name);
      }
      const resolved =
        typeof minRoleOrOptions === "string"
          ? { minRole: minRoleOrOptions, defaultGrants: undefined }
          : {
              minRole: minRoleOrOptions.minRole,
              defaultGrants: minRoleOrOptions.defaultGrants,
            };
      registry.capabilities.set(name, {
        name,
        minRole: resolved.minRole,
        defaultGrants: resolved.defaultGrants
          ? [...new Set(resolved.defaultGrants)].sort()
          : undefined,
        registeredBy: pluginId,
      });
    },

    registerSettingsGroup: (name, options) => {
      assertValidIdentifier("settings group", name);
      if (registry.settingsGroups.has(name)) {
        throw new DuplicateRegistrationError("settings group", name);
      }
      assertMetaBoxFields("settings group", name, options.fields);
      registry.settingsGroups.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
    },

    registerSettingsPage: (name, options) => {
      assertValidIdentifier("settings page", name);
      if (registry.settingsPages.has(name)) {
        throw new DuplicateRegistrationError("settings page", name);
      }
      for (const groupName of options.groups) {
        assertValidIdentifier("settings group reference", groupName);
      }
      if (new Set(options.groups).size !== options.groups.length) {
        throw PluginContextError.settingsPageDuplicateGroup({ name });
      }
      registry.settingsPages.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
    },

    registerRewriteRule: (pattern, intent, options) => {
      registry.rewriteRules.push({
        pattern,
        intent,
        priority: options?.priority ?? DEFAULT_REWRITE_RULE_PRIORITY,
        registeredBy: pluginId,
      });
    },

    registerRpcRouter: (router) => {
      if (CORE_RPC_NAMESPACES.has(pluginId)) {
        throw PluginContextError.pluginIdCollidesWithCoreRpcNamespace({
          pluginId,
          coreNamespaces: [...CORE_RPC_NAMESPACES],
        });
      }
      if (registry.rpcRouters.has(pluginId)) {
        throw new DuplicateRegistrationError("plugin RPC router", pluginId);
      }
      registry.rpcRouters.set(pluginId, router);
    },

    registerRoute: ({ method, path, auth, handler }) => {
      assertValidPluginRoutePath(pluginId, path);
      for (const existing of registry.rawRoutes) {
        if (
          existing.pluginId === pluginId &&
          existing.method === method &&
          existing.path === path
        ) {
          throw PluginContextError.duplicateRoute({ pluginId, method, path });
        }
      }
      registry.rawRoutes.push({
        pluginId,
        method,
        path,
        auth,
        handler,
      });
    },

    registerAdminPage: (options) => {
      assertValidAdminPagePath(pluginId, options.path);
      if (registry.adminPages.has(options.path)) {
        throw new DuplicateRegistrationError("admin page", options.path);
      }
      assertComponentRef(
        pluginId,
        `admin page "${options.path}"`,
        options.component,
      );
      if (options.nav) {
        const groupId =
          typeof options.nav.group === "string"
            ? options.nav.group
            : options.nav.group.id;
        assertValidNavGroupId(pluginId, groupId);
      }
      registry.adminPages.set(options.path, {
        ...options,
        registeredBy: pluginId,
      });
    },

    registerFieldType: (options) => {
      assertValidFieldTypeName(pluginId, options.type);
      if (registry.fieldTypes.has(options.type)) {
        throw new DuplicateRegistrationError("field type", options.type);
      }
      assertComponentRef(
        pluginId,
        `field type "${options.type}"`,
        options.component,
      );
      registry.fieldTypes.set(options.type, {
        ...options,
        registeredBy: pluginId,
      });
    },

    registerLookupAdapter: (options) => {
      assertValidLookupAdapterKind(pluginId, options.kind);
      if (registry.lookupAdapters.has(options.kind)) {
        throw new DuplicateRegistrationError("lookup adapter", options.kind);
      }
      // Spread to preserve plugin-contributed option fields (e.g. the
      // `menuPicker` field that @plumix/plugin-menu adds via declaration
      // merging).
      registry.lookupAdapters.set(options.kind, {
        ...options,
        capability: options.capability ?? null,
        registeredBy: pluginId,
      });
    },

    registerLoginLink: (options) => {
      assertValidLoginLink(pluginId, options);
      for (const existing of registry.loginLinks) {
        if (
          existing.registeredBy === pluginId &&
          existing.key === options.key
        ) {
          throw new DuplicateRegistrationError(
            "login link",
            `${pluginId}:${options.key}`,
          );
        }
      }
      registry.loginLinks.push({
        ...options,
        registeredBy: pluginId,
      });
    },

    registerScheduledTask: (task) => {
      assertValidScheduledTask(pluginId, task);
      for (const existing of registry.scheduledTasks) {
        if (existing.registeredBy === pluginId && existing.id === task.id) {
          throw new DuplicateRegistrationError(
            "scheduled task",
            `${pluginId}:${task.id}`,
          );
        }
      }
      registry.scheduledTasks.push({
        ...task,
        registeredBy: pluginId,
      });
    },
  };

  if (extensions && extensions.size > 0) {
    const target = ctx as unknown as Record<string, unknown>;
    for (const [key, value] of extensions) {
      if (key in target) {
        throw PluginContextError.extensionShadowsBuiltin({ key });
      }
      target[key] = value;
    }
  }

  return ctx as PluginSetupContext;
}

// Three meta-box registrations (entry/term/user) only differ in their
// target Map and the human-facing kind label — extracted into a
// factory so the call sites read as data, not three near-identical
// blocks.
function makeMetaBoxRegistrar<
  T extends { readonly id: string; readonly fields: readonly MetaBoxField[] },
>(
  map: Map<string, T & { registeredBy: string | null }>,
  kind: string,
  pluginId: string,
): (id: string, options: Omit<T, "id">) => void {
  return (id, options) => {
    if (map.has(id)) throw new DuplicateRegistrationError(kind, id);
    assertMetaBoxFields(kind, id, options.fields);
    map.set(id, {
      ...(options as unknown as T),
      id,
      registeredBy: pluginId,
    });
  };
}

function assertComponentRef(
  pluginId: string,
  descriptor: string,
  ref: unknown,
): void {
  if (typeof ref !== "string" || ref.length === 0) {
    throw PluginContextError.invalidComponentRef({ pluginId, descriptor });
  }
}

const IDENTIFIER_NAME_RE = /^[a-z][a-z0-9_-]*$/;

function assertValidFieldTypeName(pluginId: string, type: string): void {
  if (!IDENTIFIER_NAME_RE.test(type) || type.length > 64) {
    throw PluginContextError.invalidFieldTypeName({
      pluginId,
      type,
      pattern: IDENTIFIER_NAME_RE.source,
      maxLength: 64,
    });
  }
}

function assertValidLookupAdapterKind(pluginId: string, kind: string): void {
  if (!IDENTIFIER_NAME_RE.test(kind) || kind.length > 64) {
    throw PluginContextError.invalidLookupAdapterKind({
      pluginId,
      kind,
      pattern: IDENTIFIER_NAME_RE.source,
      maxLength: 64,
    });
  }
}

// Lowercase alphanum + dash/underscore, 1–32 chars, must start with a
// letter. Matches `OAUTH_PROVIDER_KEY_PATTERN` exactly so keys read
// consistently across login-button surfaces. Leading-letter constraint
// keeps the wire id `${pluginId}:${key}` from looking like an opaque
// numeric identifier in logs.
const LOGIN_LINK_KEY_RE = /^[a-z][a-z0-9_-]{0,31}$/;

const SCHEDULED_TASK_ID_RE = /^[a-z0-9][a-z0-9_/-]{0,63}$/i;

function assertValidScheduledTask(pluginId: string, task: ScheduledTask): void {
  if (!SCHEDULED_TASK_ID_RE.test(task.id)) {
    throw PluginContextError.invalidScheduledTaskId({ pluginId, id: task.id });
  }
  if (typeof task.handler !== "function") {
    throw PluginContextError.scheduledTaskHandlerMissing({
      pluginId,
      id: task.id,
    });
  }
}

function assertValidLoginLink(
  pluginId: string,
  options: LoginLinkOptions,
): void {
  if (!LOGIN_LINK_KEY_RE.test(options.key)) {
    throw PluginContextError.invalidLoginLinkKey({
      pluginId,
      key: options.key,
    });
  }
  if (options.label.length === 0) {
    throw PluginContextError.loginLinkEmptyLabel({
      pluginId,
      key: options.key,
    });
  }
  // CR/LF defense: label is rendered into HTML by the admin, but a
  // future logger / audit-trail consumer might splice it into a
  // line-oriented format. Block at the boundary.
  if (/[\r\n]/.test(options.label)) {
    throw PluginContextError.loginLinkLabelHasCrLf({
      pluginId,
      key: options.key,
    });
  }
  // href must be a same-origin path or an https:// URL — block
  // `javascript:`, `data:`, protocol-relative `//`, and other schemes
  // a misconfigured or hostile plugin might surface.
  const isSameOriginPath =
    options.href.startsWith("/") && !options.href.startsWith("//");
  const isHttps = options.href.startsWith("https://");
  if (!isSameOriginPath && !isHttps) {
    throw PluginContextError.invalidLoginLinkHref({
      pluginId,
      key: options.key,
      href: options.href,
    });
  }
}

function assertValidNavGroupId(pluginId: string, id: string): void {
  if (id.length === 0 || id.length > MAX_PLUGIN_ID_LENGTH) {
    throw PluginContextError.invalidNavGroupIdLength({
      pluginId,
      id,
      maxLength: MAX_PLUGIN_ID_LENGTH,
    });
  }
  if (!PLUGIN_ID_RE.test(id)) {
    throw PluginContextError.invalidNavGroupIdShape({
      pluginId,
      id,
      pattern: PLUGIN_ID_RE.source,
    });
  }
}

// Shared `/`-anchored path validation: must start with /, no `//` or
// `..` traversal, no `?` / `#` (we match on pathname only). The
// admin-page and plugin-route validators diverge after this on how
// they handle `*`, so the wildcard rule stays at each call site.
function assertValidPathPrefix(
  pluginId: string,
  path: string,
  kind: string,
): void {
  if (!path.startsWith("/")) {
    throw PluginContextError.pathMustStartWithSlash({ pluginId, kind, path });
  }
  if (path.includes("//") || path.includes("..")) {
    throw PluginContextError.pathContainsTraversal({ pluginId, kind, path });
  }
  if (path.includes("?") || path.includes("#")) {
    throw PluginContextError.pathContainsQueryOrFragment({
      pluginId,
      kind,
      path,
    });
  }
}

function assertValidAdminPagePath(pluginId: string, path: string): void {
  assertValidPathPrefix(pluginId, path, "admin page");
  if (path.includes("*")) {
    throw PluginContextError.adminPagePathContainsWildcard({ pluginId, path });
  }
}

function assertValidPluginRoutePath(pluginId: string, path: string): void {
  assertValidPathPrefix(pluginId, path, "route");
  // Allow exactly `/*` at the very end. Any other `*` is ambiguous.
  const starIndex = path.indexOf("*");
  if (starIndex !== -1 && starIndex !== path.length - 1) {
    throw PluginContextError.routePathWildcardNotAtEnd({ pluginId, path });
  }
  if (
    path.endsWith("*") &&
    (path.length < 2 || path[path.length - 2] !== "/")
  ) {
    throw PluginContextError.routePathWildcardNotAfterSlash({ pluginId, path });
  }
}

// Keep page / group / field names portable: ASCII identifier that
// starts with a letter, then letters/digits/underscores. Hyphens /
// dots are excluded so testids, URL params, and storage keys stay
// portable across SQLite / future MySQL without quoting. Length cap
// mirrors the valibot `settingsIdentifierSchema` on the RPC side so a
// plugin can't register a name its own `settings.get` / `.upsert`
// calls would then reject.
const SETTINGS_NAME_RE = /^[a-z][a-z0-9_]*$/;
const MAX_SETTINGS_IDENTIFIER_LENGTH = 64;

function assertValidIdentifier(kind: string, name: string): void {
  if (name.length > MAX_SETTINGS_IDENTIFIER_LENGTH) {
    throw PluginContextError.identifierTooLong({
      kind,
      name,
      maxLength: MAX_SETTINGS_IDENTIFIER_LENGTH,
    });
  }
  if (!SETTINGS_NAME_RE.test(name)) {
    throw PluginContextError.identifierShapeInvalid({
      kind,
      name,
      pattern: SETTINGS_NAME_RE.source,
    });
  }
}

// Must match the RPC input-schema regex for meta keys — any key that
// doesn't match is dead code (the write path rejects it), so catch it
// at registration instead of letting the admin discover it later.
const META_FIELD_KEY_RE = /^[a-zA-Z0-9_:-]+$/;

// Cap on fields per box — keeps the admin's per-request payload
// bounded and signals a modeling problem if a plugin wants to pile
// hundreds of fields into one card. Matches the RPC input-schema cap
// on the meta/upsert request surface.
const MAX_FIELDS_PER_META_BOX = 200;

function assertMetaBoxFields(
  kind: string,
  id: string,
  fields: readonly MetaBoxField[],
): void {
  if (fields.length > MAX_FIELDS_PER_META_BOX) {
    throw PluginContextError.metaBoxTooManyFields({
      kind,
      id,
      count: fields.length,
      maxFields: MAX_FIELDS_PER_META_BOX,
    });
  }
  const seen = new Set<string>();
  for (const field of fields) {
    if (!META_FIELD_KEY_RE.test(field.key)) {
      throw PluginContextError.metaBoxFieldInvalidKey({
        kind,
        id,
        fieldKey: field.key,
        pattern: META_FIELD_KEY_RE.source,
      });
    }
    if (seen.has(field.key)) {
      throw PluginContextError.metaBoxFieldDuplicateKey({
        kind,
        id,
        fieldKey: field.key,
      });
    }
    seen.add(field.key);
  }
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };
