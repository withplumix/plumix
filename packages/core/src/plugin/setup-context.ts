import type {
  BlockPattern,
  BlockSpec,
  MarkSpec,
  ShortcodeSpec,
} from "@plumix/blocks";
import { isReservedBlockName } from "@plumix/blocks";

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
import type { RedirectRule } from "../route/redirects.js";
import type {
  RegisteredTemplateDep,
  TemplateDepLoader,
} from "../template-deps.js";
import type { TemplateDepRegistry } from "../template.js";
import type {
  EntryMetaBoxDrift,
  SettingsGroupDrift,
  TermMetaBoxDrift,
  UserMetaBoxDrift,
} from "./fields/contributions.js";
import type { LookupAdapterOptions } from "./lookup.js";
import type {
  AdminPageOptions,
  ArchiveTypeOptions,
  DashboardWidgetOptions,
  EntryMetaBoxOptions,
  EntryTypeOptions,
  FieldTypeOptions,
  LoginLinkOptions,
  MetaBoxFieldInput,
  MutablePluginRegistry,
  PluginRegistry,
  PluginRouteAuth,
  PluginRouteMethod,
  PluginRpcRouter,
  PublicRouteOptions,
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
import { compileMetaBoxFields } from "./manifest.js";
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
  assertValidPublicRoutePath,
  assertValidRestResourcePath,
  assertValidScheduledTask,
} from "./validation/index.js";

export interface PluginSetupContextBase {
  readonly id: string;

  /**
   * What every plugin has registered so far — the very object
   * `AppContext.plugins` hands a request handler, read-only and live.
   *
   * During `setup` it holds only what the plugins ahead of this one put there,
   * so read it from the `theme:ready` action instead: by then every entry type
   * and taxonomy exists, which is what lets a plugin enumerate them and claim
   * concrete paths through {@link registerPublicRoute} rather than match an
   * ambiguous pattern per request. What a plugin registers from its *own*
   * `theme:ready` handler is only there for a subscriber that runs after it,
   * which is why registration belongs in `setup`.
   */
  readonly plugins: PluginRegistry;

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
  registerEntryMetaBox<Id extends string, const O extends EntryMetaBoxOptions>(
    id: Id,
    options: O & EntryMetaBoxDrift<Id, O>,
  ): void;
  /**
   * Same model as `registerEntryMetaBox`, but scoped to termTaxonomies and
   * rendered on the term edit form as one stacked shadcn `<Card>` per
   * box. `registerTermMeta` is not a separate step — the box's fields
   * are the meta key contract.
   */
  registerTermMetaBox<Id extends string, const O extends TermMetaBoxOptions>(
    id: Id,
    options: O & TermMetaBoxDrift<Id, O>,
  ): void;

  /**
   * Same model as `registerEntryMetaBox`, but rendered on the user
   * edit form. Users have a flat meta keyspace (no scope property) —
   * all registered boxes target every user; use `capability` to gate
   * which boxes the viewer sees.
   */
  registerUserMetaBox<Id extends string, const O extends UserMetaBoxOptions>(
    id: Id,
    options: O & UserMetaBoxDrift<Id, O>,
  ): void;
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
  registerSettingsGroup<
    Name extends string,
    const O extends SettingsGroupOptions,
  >(
    name: Name,
    options: O & SettingsGroupDrift<Name, O>,
  ): void;

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
   * Register public-route redirects (301/302/307/308) or `410 Gone`. Matched
   * by the dispatcher ahead of the content route map, so a redirect shadows a
   * would-be content page. Each rule maps a `from` — an exact path, a
   * `URLPattern` string (`:slug`, `*`), or a `RegExp` (`$1` / `$<name>`
   * backrefs in `to`) — to a target, or supplies a `match(url)` callback for
   * data-driven decisions. Plugin rules sit at priority 20 by default; a
   * per-rule `priority` overrides it (lower wins). The site's own
   * `config.redirects` and the theme's `redirects` merge into the same set.
   */
  registerRedirects(rules: readonly RedirectRule[]): void;

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
   *  yourself — the dispatcher can't infer it from `ctx`.
   *
   *  `cacheable: true` opts the route into the edge cache: a GET is answered
   *  from the entry stored under its URL, so the handler runs once per URL
   *  rather than once per request; every other method runs the handler. Take
   *  it only where the route answers every visitor with the same document. The
   *  whole URL is the key — query string included, so any parameter a caller
   *  invents is another entry — and nothing else is: the cookie is dropped, a
   *  `Vary` the handler sets is not a key axis here, and registering the
   *  opt-in on a route that isn't `auth: "public"` throws.
   *
   *  Freshness is the handler's: it keeps a `cache-control` it set, and a
   *  response that set none takes the site's page TTL. So are the tags: the
   *  entry stores untagged unless the handler calls `tagCacheEntry` while it
   *  runs, and `immutable` belongs only on a content-addressed URL, since a
   *  purge reaches Cloudflare but never a browser or a scraper. A response
   *  answering a request that carried a session, an `Authorization` header or
   *  a `?preview=` token is never stored, nor is one that sets a cookie or
   *  declares itself `private` / `no-store` — that last is how a handler keeps
   *  one personalized answer out of the shared entry.
   *
   *  `formPost: true` drops the `X-Plumix-Request` requirement so a plain HTML
   *  `<form method="post">` can reach the route — a browser cannot set a custom
   *  header on an ordinary form submit, so without it no-JavaScript submission
   *  is impossible. It exempts the POST and nothing else, so a route
   *  registered as `method: "*"` still gates every other write method. The
   *  Origin check is then the whole control: an exempt request has to carry an
   *  Origin (or Referer) matching the site, where an ordinary one is only
   *  rejected for contradicting it. The header gate exists
   *  to stop a cross-origin POST carrying ambient session authority, and a
   *  public submission carries none — an attacker forging one has merely
   *  submitted a form they could have submitted directly. That is why the
   *  opt-in is rejected on any route that isn't `auth: "public"`, and why the
   *  handler must never derive privilege from a session: no capability check,
   *  no write the visitor could not have made anonymously.
   *
   *  That last part is structural, not a promise the handler is trusted to
   *  keep. `ctx.user` is already null and `ctx.auth.can()` already anonymous on
   *  any public route, so `ctx.authenticator` was the one door left open — and
   *  on the request that took the exemption it resolves nobody: `authenticate`
   *  returns null, `hasSession` is false. `getContext()` agrees, so a hook
   *  listener the handler fires sees the same anonymous request it does.
   *
   *  It is per request, not per route: a JS-enhanced form posting to the same
   *  endpoint sets the header, goes through the ordinary gate and arrives with
   *  its session intact, so a handler that attributes a submission still can
   *  wherever attributing one is safe. Neither path needs a branch — a public
   *  route already has to cope with `authenticate` returning null.
   *
   *  Closing that door is the whole of it. The session cookie is still on
   *  `ctx.request` and `defaultAuthenticator()` is one import away, so a
   *  handler that goes looking recovers the user anyway; what is gone is the
   *  reading that looks like ordinary code. */
  registerRoute(options: {
    readonly method: PluginRouteMethod;
    readonly path: string;
    readonly auth: PluginRouteAuth;
    readonly cacheable?: boolean;
    readonly formPost?: boolean;
    readonly handler: (
      request: Request,
      ctx: AppContext,
    ) => Response | Promise<Response>;
  }): void;

  /**
   * Mount a route at the site root, outside the `/_plumix/<pluginId>/` prefix
   * `registerRoute` confines a plugin to — how a plugin owns `/robots.txt`,
   * `/sitemap.xml` or `/feed`. `path` is an exact pathname or a URLPattern
   * pathname whose captured groups reach the handler as its third argument.
   *
   * The route matches ahead of the redirect table and the content route map,
   * and the handler always answers: there is no fall-through to a page that
   * would otherwise own the path. So register from the `theme:ready` action,
   * where every entry type and taxonomy is known, and enumerate concrete paths
   * rather than claiming an ambiguous pattern.
   *
   * Two plugins claiming one path, or a path inside `/_plumix/`, throws at
   * boot. `cacheable` is the same opt-in `registerRoute` documents. The route
   * answers GET and HEAD only — a write method 405s at the public method gate
   * above it.
   *
   * The handler runs ahead of the access gate and the principal loader, so
   * `ctx.user` is null however the request was authenticated: this is a machine
   * endpoint that answers every visitor the same way. A handler that enumerates
   * content is therefore enumerating it for an anonymous reader and has to
   * exclude what an anonymous reader may not see. `ctx.request` has had any
   * `basePath` stripped, so build outbound URLs from `ctx.origin` +
   * `ctx.basePath`, never from `request.url`.
   */
  registerPublicRoute(options: PublicRouteOptions): void;

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
   * Register several blocks at once — the array ergonomic of `registerBlock`,
   * mirroring the theme `blocks` field. Equivalent to calling `registerBlock`
   * for each spec (same `core/` and duplicate-name guards apply per spec).
   */
  registerBlocks(specs: readonly BlockSpec[]): void;

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
   *   the `declare module "plumix"` block alongside the
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

    plugins: registry,

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
      const fields = compileMetaBoxFields(options.fields);
      assertMetaBoxFields("settings group", name, fields);
      registry.settingsGroups.set(name, {
        ...options,
        fields,
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

    registerRedirects: (rules) => {
      registry.redirects.push(...rules);
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

    registerRoute: ({ method, path, auth, cacheable, formPost, handler }) => {
      assertValidPluginRoutePath(pluginId, path);
      if (auth !== "public") {
        if (cacheable === true) {
          throw PluginContextError.cacheableRouteNotPublic({
            pluginId,
            method,
            path,
          });
        }
        if (formPost === true) {
          throw PluginContextError.formPostRouteNotPublic({
            pluginId,
            method,
            path,
          });
        }
      }
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
        cacheable,
        formPost,
        handler,
      });
    },

    registerPublicRoute: (options) => {
      assertValidPublicRoutePath(pluginId, options.path);
      // Collisions are a boot check, not a registration one: a plugin registers
      // from `theme:ready`, so the full set exists only once every plugin has.
      registry.publicRoutes.push({ ...options, pluginId });
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
      if (isReservedBlockName(spec.name)) {
        throw PluginContextError.blockNameReserved({
          pluginId,
          name: spec.name,
        });
      }
      if (registry.blockSpecs.has(spec.name)) {
        throw DuplicateRegistrationError.alreadyRegistered({
          kind: "block",
          identifier: spec.name,
        });
      }
      registry.blockSpecs.set(spec.name, { spec, registeredBy: pluginId });
    },

    registerBlocks: (specs) => {
      for (const spec of specs) ctx.registerBlock(spec);
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
      // Safety: the loader is stored under the very kind it was registered
      // for, and every read goes back through that key, so the slugs it
      // receives and the results it returns are the ones it declared.
      const erased = load as unknown as RegisteredTemplateDep["load"];
      registry.templateDeps.set(kind, {
        kind,
        load: erased,
        registeredBy: pluginId,
      });
    },
  };

  if (extensions && extensions.size > 0) {
    // Safety: the write is keyed, never structural — every key that already
    // exists is rejected below, so no declared field of the setup context can
    // be reached through this view.
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
// blocks. Fluent builders in `options.fields` compile to plain
// definitions here, so the registered shape (and everything
// downstream) carries `MetaBoxField` only.
function makeMetaBoxRegistrar<R extends { readonly id: string }>(
  map: Map<string, R>,
  kind: string,
  pluginId: string,
): (
  id: string,
  options: { readonly fields: readonly MetaBoxFieldInput[] },
) => void {
  return (id, options) => {
    if (map.has(id))
      throw DuplicateRegistrationError.alreadyRegistered({
        kind,
        identifier: id,
      });
    const fields = compileMetaBoxFields(options.fields);
    assertMetaBoxFields(kind, id, fields);
    // Safety: every member `R` declares is present on the value — `id`,
    // `registeredBy` and `fields` are written here, and `R`'s remaining
    // members ride in on `options`, which the caller passes whole. The
    // compiler can't see the second half because the parameter is typed down
    // to the one field this factory reads.
    map.set(id, {
      ...options,
      fields,
      id,
      registeredBy: pluginId,
    } as unknown as R);
  };
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };
