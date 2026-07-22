import type {
  BlockPattern,
  BlockSpec,
  MarkSpec,
  ShortcodeSpec,
} from "@plumix/blocks";

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
import type { McpTool } from "../mcp/tool.js";
import type { RouteIntent } from "../route/intent.js";
import type {
  RegisteredTemplateDep,
  TemplateDepLoader,
} from "../template-deps.js";
import type { TemplateDepRegistry } from "../template.js";
import type { LookupAdapterOptions } from "./lookup.js";
import type {
  AdminPageOptions,
  ArchiveTypeOptions,
  DashboardWidgetOptions,
  EntryMetaBoxOptions,
  EntryTypeOptions,
  FieldTypeOptions,
  LoginLinkOptions,
  MetaBoxField,
  MutablePluginRegistry,
  PluginRouteAuth,
  PluginRouteMethod,
  PluginRpcRouter,
  RestResourceOptions,
  ScheduledTask,
  SettingsGroupOptions,
  SettingsPageOptions,
  TermMetaBoxOptions,
  TermTaxonomyOptions,
  UserMetaBoxOptions,
} from "./manifest.js";
import type { PluginContextExtensions } from "./provides-context.js";
import {
  deriveEntryTypeCapabilities,
  deriveTermTaxonomyCapabilities,
} from "../auth/rbac.js";
import { CORE_MCP_TOOL_NAMES } from "../mcp/registry.js";
import { DEFAULT_REWRITE_RULE_PRIORITY } from "../route/compile.js";
import { CORE_RPC_NAMESPACES } from "../rpc/namespaces.js";
import { RESERVED_DEP_KIND_NAMES } from "../template-deps.js";
import { DuplicateRegistrationError, PluginContextError } from "./errors.js";
import {
  assertComponentRef,
  assertMetaBoxFields,
  assertNamespacedId,
  assertValidAdminPagePath,
  assertValidFieldTypeName,
  assertValidIdentifier,
  assertValidLoginLink,
  assertValidLookupAdapterKind,
  assertValidNavGroupId,
  assertValidPluginRoutePath,
  assertValidRestResourcePath,
  assertValidScheduledTask,
} from "./validation/index.js";

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
   *
   * Paths with a static-asset extension (`.ico`, `.js`, `.png`, fonts, …)
   * 404 before the route map runs (#1491), so a pattern ending in one of
   * those can never match. Content-plausible extensions (`.txt`, `.xml`,
   * `.json`, `.html`) stay routable.
   */
  registerRewriteRule(
    pattern: string,
    intent: RouteIntent,
    options?: { readonly priority?: number },
  ): void;

  /**
   * Register a whole archive type — URL pattern(s) + a resolver (+ an optional
   * feed) — so a plugin can add an archive (e.g. `/events/:series`) that
   * dispatches and templates like a built-in one, with no core changes. The
   * resolver returns `{ data, title }` or `null` (404). Augment
   * `ArchiveTypeRegistry` with the same `name` so `forArchiveType(name)` types
   * the template's `data`. Registering the same name twice throws.
   */
  registerArchiveType(name: string, options: ArchiveTypeOptions): void;

  /** Mounted at `/_plumix/rpc/<pluginId>/*`. */
  registerRpcRouter(router: PluginRpcRouter): void;

  /**
   * Contribute a read tool to the MCP endpoint (`/_plumix/mcp`). Tool names
   * are global and snake_case (e.g. `media_list`); collisions with core tools
   * or another plugin's tool throw at registration. The tool's `run` delegates
   * to a service — MCP never calls oRPC.
   */
  registerMcpTool(tool: McpTool): void;

  /** Mounted at `/_plumix/<pluginId><path>`. CSRF is enforced by the
   *  dispatcher. `ctx.locale` reflects the visitor's pick (cookie +
   *  Accept-Language) since the route sits under `/_plumix/`; if the
   *  handler emits locale-bearing HTML, set `Vary: Cookie, Accept-Language`
   *  yourself — the dispatcher can't infer it from `ctx`. */
  registerRoute(options: {
    readonly method: PluginRouteMethod;
    readonly path: string;
    readonly auth: PluginRouteAuth;
    readonly handler: (
      request: Request,
      ctx: AppContext,
    ) => Response | Promise<Response>;
  }): void;

  /**
   * Contribute a REST resource into the shared `/_plumix/api/v1/` namespace.
   * Unlike `registerRoute` (a raw Request handler under the plugin's own
   * prefix), this is an oRPC resource that merges into the public REST router
   * and appears automatically in `openapi.json`. `path` is relative to the API
   * prefix; core enforces `auth` before the handler runs. Path collisions
   * (plugin↔plugin or plugin↔core) are rejected at boot.
   */
  registerRestResource(options: RestResourceOptions): void;

  registerAdminPage(options: AdminPageOptions): void;
  /**
   * Register a widget rendered on the admin dashboard. The component is
   * resolved from the plugin's admin chunk at render; gate visibility
   * with `capability`. Mirrors `registerAdminPage` but targets the
   * dashboard grid instead of a route.
   */
  registerDashboardWidget(options: DashboardWidgetOptions): void;
  registerFieldType(options: FieldTypeOptions): void;
  /**
   * Register a `BlockSpec` produced by `defineBlock` from `plumix/blocks`.
   * Plugin-contributed blocks merge into the per-app block registry at
   * `buildApp` time with deterministic precedence theme > plugin > core.
   * Specs using the `core/` namespace are rejected — that namespace is
   * reserved for `@plumix/blocks`'s built-in primitives.
   */
  registerBlock(spec: BlockSpec): void;

  /**
   * Register a `MarkSpec` produced by `defineMark` from `plumix/blocks`.
   * Plugin-contributed marks merge into the per-app mark registry at
   * `buildApp` time. Names that collide with the core mark set are
   * rejected; the convention for plugin marks is `pluginId/markName`.
   */
  registerMark(spec: MarkSpec): void;
  /**
   * Register a `ShortcodeSpec` produced by `defineShortcode` from
   * `plumix/blocks`. Plugin- and theme-contributed shortcodes merge into
   * the per-app shortcode registry at `buildApp` time with last-wins
   * precedence (core < plugin < theme). Duplicate tags across plugins
   * throw — tags are flat and unprefixed, so a collision is a real bug.
   */
  registerShortcode(spec: ShortcodeSpec): void;
  /**
   * Register a `BlockPattern` produced by `definePattern` from
   * `plumix/blocks`. Plugin- and theme-contributed patterns merge into
   * the per-app pattern registry at `buildApp` time. Duplicate slugs
   * across plugins throw — patterns are not silently overridden.
   */
  registerPattern(spec: BlockPattern): void;
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
  /**
   * Register a template-dep loader. Themes declare what they need
   * (`defineTemplate({ [kind]: ["slug-a", "slug-b"], render })`); the
   * framework fires every declared dep's loader in parallel per
   * request and passes the results to the template's render
   * function. The `kind` must match a key in the augmentable
   * `TemplateDepRegistry` interface; two plugins registering the
   * same `kind` is a boot-time error.
   *
   * **Augmenting `TemplateDepRegistry` so consumers see the kind.**
   * TypeScript only merges the augmentation when the file declaring
   * it is in the consumer's tsc program. The pattern depends on where
   * the plugin lives:
   *
   * - **Workspace-package plugin** (e.g. `@plumix/plugin-menu`): put
   *   the `declare module "plumix/plugin"` block alongside the
   *   result type the plugin exports from `/server`. Themes import
   *   the result type from `/server`, which pulls the augmentation
   *   in too. Avoid the main entry — themes that only touch `/server`
   *   types never load it.
   *
   * - **Consumer-local plugin** (defined inline in the consumer's
   *   source, e.g. `playground/plugins/post-navigation.ts`): the
   *   theme can't import from the consumer (wrong dep direction).
   *   Put the `declare module` block in a shared types file (e.g.
   *   `plumix-types.d.ts`) that both the consumer's plumix config
   *   and the theme entry import as a side effect.
   */
  registerTemplateDep<TKind extends keyof TemplateDepRegistry>(
    kind: TKind,
    options: { readonly load: TemplateDepLoader<TKind> },
  ): void;
}

export type PluginSetupContext = PluginSetupContextBase &
  PluginContextExtensions;

interface CreatePluginContextArgs {
  readonly pluginId: string;
  readonly hooks: HookRegistry;
  readonly registry: MutablePluginRegistry;
  readonly extensions?: ReadonlyMap<string, unknown>;
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
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "entry type",
          identifier: name,
        });
      registry.entryTypes.set(name, {
        ...options,
        name,
        registeredBy: pluginId,
      });
      addDerivedCaps(deriveEntryTypeCapabilities(name, options));
    },

    registerTermTaxonomy: (name, options) => {
      if (registry.termTaxonomies.has(name))
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "termTaxonomy",
          identifier: name,
        });
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
        UserRole | { minRole: UserRole; defaultGrants?: readonly UserRole[] },
    ) => {
      if (registry.capabilities.has(name)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "capability",
          identifier: name,
        });
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
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "settings group",
          identifier: name,
        });
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
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "settings page",
          identifier: name,
        });
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

    registerArchiveType: (name, options) => {
      if (registry.archiveTypes.has(name))
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "archive type",
          identifier: name,
        });
      registry.archiveTypes.set(name, {
        ...options,
        name,
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
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "plugin RPC router",
          identifier: pluginId,
        });
      }
      registry.rpcRouters.set(pluginId, router);
    },

    registerMcpTool: (tool) => {
      if (
        CORE_MCP_TOOL_NAMES.has(tool.name) ||
        registry.mcpTools.has(tool.name)
      ) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "MCP tool",
          identifier: tool.name,
        });
      }
      registry.mcpTools.set(tool.name, { tool, registeredBy: pluginId });
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

    registerRestResource: (options) => {
      assertValidRestResourcePath(pluginId, options.path);
      // Cross-resource path collisions are validated at boot (buildApp), where
      // the full set across all plugins + core reserved paths is known.
      registry.restResources.push({
        ...options,
        pluginId,
        method: options.method ?? "GET",
      });
    },

    registerAdminPage: (options) => {
      assertValidAdminPagePath(pluginId, options.path);
      if (registry.adminPages.has(options.path)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "admin page",
          identifier: options.path,
        });
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

    registerDashboardWidget: (options) => {
      assertNamespacedId("dashboard widget id", options.id, pluginId);
      if (registry.dashboardWidgets.has(options.id)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "dashboard widget",
          identifier: options.id,
        });
      }
      assertComponentRef(
        pluginId,
        `dashboard widget "${options.id}"`,
        options.component,
      );
      registry.dashboardWidgets.set(options.id, {
        ...options,
        registeredBy: pluginId,
      });
    },

    registerFieldType: (options) => {
      assertValidFieldTypeName(pluginId, options.type);
      if (registry.fieldTypes.has(options.type)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "field type",
          identifier: options.type,
        });
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

    registerBlock: (spec) => {
      if (registry.blockSpecs.has(spec.name)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "block",
          identifier: spec.name,
        });
      }
      registry.blockSpecs.set(spec.name, { spec, registeredBy: pluginId });
    },

    registerMark: (spec) => {
      if (registry.markSpecs.has(spec.name)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "mark",
          identifier: spec.name,
        });
      }
      registry.markSpecs.set(spec.name, { spec, registeredBy: pluginId });
    },

    registerShortcode: (spec) => {
      if (registry.shortcodeSpecs.has(spec.name)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "shortcode",
          identifier: spec.name,
        });
      }
      registry.shortcodeSpecs.set(spec.name, { spec, registeredBy: pluginId });
    },

    registerPattern: (spec) => {
      if (registry.patternSpecs.has(spec.name)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "pattern",
          identifier: spec.name,
        });
      }
      registry.patternSpecs.set(spec.name, { spec, registeredBy: pluginId });
    },

    registerLookupAdapter: (options) => {
      assertValidLookupAdapterKind(pluginId, options.kind);
      if (registry.lookupAdapters.has(options.kind)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "lookup adapter",
          identifier: options.kind,
        });
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
          throw DuplicateRegistrationError.alreadyRegistered({
            kind: "login link",
            identifier: `${pluginId}:${options.key}`,
          });
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
          throw DuplicateRegistrationError.alreadyRegistered({
            kind: "scheduled task",
            identifier: `${pluginId}:${task.id}`,
          });
        }
      }
      registry.scheduledTasks.push({
        ...task,
        registeredBy: pluginId,
      });
    },

    registerTemplateDep: (kind, { load }) => {
      if (RESERVED_DEP_KIND_NAMES.has(kind)) {
        // Reserved framework keys would silently no-op at request time
        // since the merger skips them on theme/template traversal.
        throw PluginContextError.templateDepKindReserved({
          pluginId,
          kind,
        });
      }
      const existing = registry.templateDeps.get(kind);
      if (existing) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "template dep",
          identifier: kind,
        });
      }
      // Erase the per-kind generic at storage time — the typed view is
      // recovered when `defineTemplate` looks the loader up by kind.
      const erased = load as unknown as RegisteredTemplateDep["load"];
      registry.templateDeps.set(kind, {
        kind,
        load: erased,
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
    if (map.has(id))
      throw DuplicateRegistrationError.alreadyRegistered({
        kind,
        identifier: id,
      });
    assertMetaBoxFields(kind, id, options.fields);
    map.set(id, {
      ...(options as unknown as T),
      id,
      registeredBy: pluginId,
    });
  };
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };
