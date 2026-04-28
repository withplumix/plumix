import type { DerivedCapability } from "../auth/rbac.js";
import type { AppContext } from "../context/app.js";
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
import type {
  AdminPageOptions,
  BlockOptions,
  EntryMetaBoxOptions,
  EntryTypeOptions,
  FieldTypeOptions,
  MetaBoxField,
  MutablePluginRegistry,
  PluginRouteAuth,
  PluginRouteMethod,
  PluginRpcRouter,
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
  registerBlock(options: BlockOptions): void;
  registerFieldType(options: FieldTypeOptions): void;
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
}

export function createPluginProvidesContext({
  pluginId,
  pluginExtensions,
  themeExtensions,
}: CreateProvidesContextArgs): PluginProvidesContext {
  const stash = (
    target: Map<string, ContextExtensionEntry>,
    kind: "Plugin" | "Theme",
    key: string,
    value: unknown,
  ): void => {
    if (typeof key !== "string" || key.length === 0) {
      throw new Error(
        `Plugin "${pluginId}" called extend${kind}Context with an ` +
          `invalid key — must be a non-empty string.`,
      );
    }
    const existing = target.get(key);
    if (existing) {
      throw new Error(
        `Plugin "${pluginId}" extended the ${kind.toLowerCase()} context ` +
          `with "${key}", but "${existing.pluginId}" already registered it. ` +
          `Each extension key has exactly one provider — rename one or ` +
          `consolidate the providing plugin.`,
      );
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
          throw new Error(
            `Plugin "${pluginId}" derived capability "${cap.name}" with ` +
              `minRole "${cap.minRole}", but it was already registered ` +
              `with minRole "${existing.minRole}" by ` +
              `"${existing.registeredBy ?? "<unknown>"}". Two entry types ` +
              `/ termTaxonomies sharing a capabilityType must agree on any ` +
              `\`capabilities\` override — the pool has one cap per name.`,
          );
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
        throw new Error(
          `Settings page "${name}" lists a group more than once; ` +
            `each group may appear at most once per page.`,
        );
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
        throw new Error(
          `Plugin id "${pluginId}" collides with core RPC namespace. ` +
            `Rename the plugin — reserved names are: ` +
            `${[...CORE_RPC_NAMESPACES].sort().join(", ")}.`,
        );
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
          throw new Error(
            `Plugin "${pluginId}" already registered a route for ` +
              `${method} ${path}.`,
          );
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

    registerBlock: (options) => {
      assertValidBlockName(pluginId, options.name);
      if (registry.blocks.has(options.name)) {
        throw new DuplicateRegistrationError("block", options.name);
      }
      // Defense against loose `any` casts at the call site.
      const kind = options.kind as unknown;
      if (kind !== "node" && kind !== "mark") {
        throw new Error(
          `Plugin "${pluginId}" registered block "${options.name}" with ` +
            `invalid kind "${String(kind)}" — must be "node" or "mark".`,
        );
      }
      if (options.component !== undefined) {
        // Validate any explicit value, including empty string — `if
        // (options.component)` would silently accept `component: ""`,
        // which serializes to a manifest entry the admin can't resolve.
        assertComponentRef(
          pluginId,
          `block "${options.name}"`,
          options.component,
        );
      }
      registry.blocks.set(options.name, {
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
  };

  if (extensions && extensions.size > 0) {
    const target = ctx as unknown as Record<string, unknown>;
    for (const [key, value] of extensions) {
      if (key in target) {
        throw new Error(
          `Plugin context extension key "${key}" collides with a built-in ` +
            `PluginSetupContext member. Rename the extension to avoid ` +
            `shadowing core registration APIs.`,
        );
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
    throw new Error(
      `Plugin "${pluginId}" registered ${descriptor} with an invalid ` +
        `component ref — must be a non-empty string naming the export on ` +
        `the plugin's adminEntry module (e.g. "MediaLibrary").`,
    );
  }
}

const BLOCK_NAME_RE = /^[a-z][a-z0-9_-]*$/;

function assertValidBlockName(pluginId: string, name: string): void {
  if (!BLOCK_NAME_RE.test(name) || name.length > 64) {
    throw new Error(
      `Plugin "${pluginId}" registered block with invalid name "${name}" ` +
        `— must match ${BLOCK_NAME_RE} and be at most 64 characters.`,
    );
  }
}

function assertValidFieldTypeName(pluginId: string, type: string): void {
  if (!BLOCK_NAME_RE.test(type) || type.length > 64) {
    throw new Error(
      `Plugin "${pluginId}" registered meta-box field type with invalid ` +
        `name "${type}" — must match ${BLOCK_NAME_RE} and be at most 64 ` +
        `characters.`,
    );
  }
}

function assertValidNavGroupId(pluginId: string, id: string): void {
  if (id.length === 0 || id.length > MAX_PLUGIN_ID_LENGTH) {
    throw new Error(
      `Plugin "${pluginId}" registered admin nav group with invalid id ` +
        `"${id}" — length must be 1..${MAX_PLUGIN_ID_LENGTH}.`,
    );
  }
  if (!PLUGIN_ID_RE.test(id)) {
    throw new Error(
      `Plugin "${pluginId}" registered admin nav group with invalid id ` +
        `"${id}" — must match ${PLUGIN_ID_RE}.`,
    );
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
    throw new Error(
      `Plugin "${pluginId}" ${kind} path "${path}" must start with "/".`,
    );
  }
  if (path.includes("//") || path.includes("..")) {
    throw new Error(
      `Plugin "${pluginId}" ${kind} path "${path}" contains "//" or "..".`,
    );
  }
  if (path.includes("?") || path.includes("#")) {
    throw new Error(
      `Plugin "${pluginId}" ${kind} path "${path}" must not include a query ` +
        `string or fragment — match on the pathname only.`,
    );
  }
}

function assertValidAdminPagePath(pluginId: string, path: string): void {
  assertValidPathPrefix(pluginId, path, "admin page");
  if (path.includes("*")) {
    throw new Error(
      `Plugin "${pluginId}" admin page path "${path}" must not contain "*" ` +
        `— register nested routes via TanStack Router children inside the ` +
        `page component rather than a wildcard suffix.`,
    );
  }
}

function assertValidPluginRoutePath(pluginId: string, path: string): void {
  assertValidPathPrefix(pluginId, path, "route");
  // Allow exactly `/*` at the very end. Any other `*` is ambiguous.
  const starIndex = path.indexOf("*");
  if (starIndex !== -1 && starIndex !== path.length - 1) {
    throw new Error(
      `Plugin "${pluginId}" route path "${path}" may only contain "*" ` +
        `as a trailing wildcard (e.g. "/storage/*").`,
    );
  }
  if (
    path.endsWith("*") &&
    (path.length < 2 || path[path.length - 2] !== "/")
  ) {
    throw new Error(
      `Plugin "${pluginId}" route path "${path}" must place the trailing ` +
        `wildcard after a "/" ("/prefix/*", not "/prefix*").`,
    );
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
    throw new Error(
      `Invalid ${kind} name "${name}" — names are capped at ` +
        `${MAX_SETTINGS_IDENTIFIER_LENGTH} characters to match the RPC ` +
        `input schema.`,
    );
  }
  if (!SETTINGS_NAME_RE.test(name)) {
    throw new Error(
      `Invalid ${kind} name "${name}" — expected lowercase ASCII ` +
        `[a-z][a-z0-9_]* so storage keys, testids, and URLs stay portable.`,
    );
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
    throw new Error(
      `${kind} "${id}" declares ${fields.length} fields; the admin caps ` +
        `a single box at ${MAX_FIELDS_PER_META_BOX}. Split into multiple boxes.`,
    );
  }
  const seen = new Set<string>();
  for (const field of fields) {
    if (!META_FIELD_KEY_RE.test(field.key)) {
      throw new Error(
        `${kind} "${id}" declares field with invalid key "${field.key}" — ` +
          `meta keys must match ${META_FIELD_KEY_RE}.`,
      );
    }
    if (seen.has(field.key)) {
      throw new Error(
        `${kind} "${id}" declares field "${field.key}" more than once.`,
      );
    }
    seen.add(field.key);
  }
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };
