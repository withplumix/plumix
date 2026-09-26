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
  TemplateDepKeys,
  TemplateDepLoader,
} from "../template-deps.js";
import type { TemplateDepKeyedBy, TemplateDepRegistry } from "../template.js";
import type {
  EntryMetaBoxDrift,
  SettingsGroupDrift,
  TermMetaBoxDrift,
  UserMetaBoxDrift,
} from "./fields/contributions.js";
import type { ImageRoleName, ImageRoleOptions } from "./image-roles.js";
import type { LookupAdapterOptions } from "./lookup.js";
import type {
  AdminPageOptions,
  ArchiveTypeDeclaration,
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
import { isPrivateSettingsGroup } from "../db/settings-groups.js";
import { CORE_MCP_TOOL_NAMES } from "../mcp/registry.js";
import { DEFAULT_REWRITE_RULE_PRIORITY } from "../route/compile.js";
import { CORE_RPC_NAMESPACES } from "../rpc/namespaces.js";
import { RESERVED_DEP_KIND_NAMES } from "../template-deps.js";
import { DuplicateRegistrationError, PluginContextError } from "./errors.js";
import { compileMetaBoxFields } from "./manifest.js";
import { toRegisteredEntryType, toRegisteredTermTaxonomy } from "./registry.js";
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
   * Register a whole archive type — URL pattern(s) plus what the archive is —
   * so a plugin can add an archive (e.g. `/events/:series`) that dispatches
   * and templates like a built-in one, with no core changes.
   *
   * Declare `entries` and core does the listing: it pages the query, orders
   * it, derives each route's `/page/:page` form, 404s past the last page, and
   * tags the stored page with the types the query can list. A `title` (or a
   * `resolve` that returns one) names the page. Without `entries` the
   * resolver produces the whole payload itself and returns `{ data, title }`
   * or `null` (404) — the shape an archive whose results are a match rather
   * than a set, like search, still needs.
   *
   * Augment `ArchiveTypeRegistry` with the same `name` so
   * `forArchiveType(name)` types the template's `data`. Registering the same
   * name twice throws.
   */
  registerArchiveType(name: string, options: ArchiveTypeDeclaration): void;

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
   *  `cacheable: true` opts the route into the CDN: a GET is answered
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
   *  entry stores untagged unless the handler calls `tagCdnEntry` while it
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
   * would otherwise own the path. So register from the descriptor's
   * `afterSetup`, where every entry type and taxonomy is known, and enumerate
   * concrete paths rather than claiming an ambiguous pattern.
   *
   * Two plugins claiming one path, or a path inside `/_plumix/`, throws at
   * boot. `cacheable` is the same opt-in `registerRoute` documents. The route
   * answers GET and HEAD only — a write method 405s at the public method gate
   * above it.
   *
   * Without `access`, the handler runs ahead of the access gate and the
   * principal loader, so `ctx.user` is null however the request was
   * authenticated: this is a machine endpoint that answers every visitor the
   * same way. A handler that enumerates content is therefore enumerating it for
   * an anonymous reader and has to exclude what an anonymous reader may not see.
   *
   * With `access`, the route is gated the way a policied archive page is: the
   * principal loads and the policy resolves before the handler runs. A reader
   * the gate refuses gets its redirect or challenge response and the handler
   * never runs; one it admits reaches the handler with `ctx.user` loaded and
   * `ctx.access` set. The response renders per reader, so it bypasses the CDN
   * even with `cacheable`.
   *
   * `ctx.request` has had any `basePath` stripped, so build outbound URLs from
   * `ctx.origin` + `ctx.basePath`, never from `request.url`.
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
   * Register a `BlockPattern`: a named block arrangement the editor's
   * inserter offers, and the starter modal too when it declares `target`.
   * Inserting one copies its body into the entry. Duplicate slugs across
   * plugins throw — patterns are not silently overridden.
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
   * Declare an image role — a purpose a media field fills for its entry, term
   * or user (`hero`, `thumbnail`, `avatar`), which readers then ask for by
   * name through `imageRoleFields`. `single` caps each scope at one field in
   * the role. Core registers `featured` (single) and `ogImage`; a name is
   * registered once, so a duplicate throws.
   *
   * Augment `ImageRoles` so the name type-checks here and in `.role()`:
   * `declare module "plumix" { interface ImageRoles { hero: true } }`.
   */
  registerImageRole(name: ImageRoleName, options: ImageRoleOptions): void;

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
   * same `kind` is a boot-time error. `keyedBy` names the entry's key
   * field — see `TemplateDepRegistry`.
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
    options: {
      readonly keyedBy: TemplateDepKeyedBy<TKind>;
      readonly load: TemplateDepLoader<TKind>;
    },
  ): void;
}

export type PluginSetupContext = PluginSetupContextBase &
  PluginContextExtensions;

export type PluginAfterSetupContext = PluginSetupContext & {
  /**
   * Everything every plugin registered — the very object `AppContext.plugins`
   * hands a request handler, read-only and live.
   *
   * Offered here and not in `setup`, where it would hold only what the plugins
   * ahead of that one had put there. By now every entry type and taxonomy
   * exists, which is what lets a plugin enumerate them and claim concrete paths
   * through `registerPublicRoute` rather than match an ambiguous pattern per
   * request. What a plugin registers from its own `afterSetup` is there only
   * for a plugin whose `afterSetup` runs later in the array.
   */
  readonly plugins: PluginRegistry;
};

interface CreatePluginContextArgs {
  readonly pluginId: string;
  readonly hooks: HookRegistry;
  readonly registry: MutablePluginRegistry;
  readonly extensions?: ReadonlyMap<string, unknown>;
}

export function createPluginSetupContext(
  args: CreatePluginContextArgs,
): PluginSetupContext {
  return withExtensions(createContextBase(args), args.extensions);
}

export function createPluginAfterSetupContext(
  args: CreatePluginContextArgs,
): PluginAfterSetupContext {
  return withExtensions(
    { ...createContextBase(args), plugins: args.registry },
    args.extensions,
  );
}

function createContextBase({
  pluginId,
  hooks,
  registry,
}: CreatePluginContextArgs): PluginSetupContextBase {
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
      const registered = claimKey(
        registry.entryTypes,
        "entry type",
        name,
        pluginId,
        () => toRegisteredEntryType(name, options, pluginId),
      );
      addDerivedCaps(deriveEntryTypeCapabilities(registered));
    },

    registerTermTaxonomy: (name, options) => {
      claimKey(registry.termTaxonomies, "term taxonomy", name, pluginId, () =>
        toRegisteredTermTaxonomy(name, options, pluginId),
      );
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
      claimKey(registry.capabilities, "capability", name, pluginId, () => {
        const resolved =
          typeof minRoleOrOptions === "string"
            ? { minRole: minRoleOrOptions, defaultGrants: undefined }
            : {
                minRole: minRoleOrOptions.minRole,
                defaultGrants: minRoleOrOptions.defaultGrants,
              };
        return {
          name,
          minRole: resolved.minRole,
          defaultGrants: resolved.defaultGrants
            ? [...new Set(resolved.defaultGrants)].sort()
            : undefined,
          registeredBy: pluginId,
        };
      });
    },

    registerSettingsGroup: (name, options) => {
      assertValidIdentifier("settings group", name);
      if (isPrivateSettingsGroup(name)) {
        throw PluginContextError.settingsGroupReserved({ pluginId, name });
      }
      claimKey(
        registry.settingsGroups,
        "settings group",
        name,
        pluginId,
        () => {
          const fields = compileMetaBoxFields(options.fields);
          assertMetaBoxFields("settings group", name, fields);
          return { ...options, fields, name, registeredBy: pluginId };
        },
      );
    },

    registerSettingsPage: (name, options) => {
      assertValidIdentifier("settings page", name);
      claimKey(registry.settingsPages, "settings page", name, pluginId, () => {
        for (const groupName of options.groups) {
          assertValidIdentifier("settings group reference", groupName);
        }
        if (new Set(options.groups).size !== options.groups.length) {
          throw PluginContextError.settingsPageDuplicateGroup({ name });
        }
        return { ...options, name, registeredBy: pluginId };
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
      claimKey(registry.archiveTypes, "archive type", name, pluginId, () => ({
        ...options,
        name,
        registeredBy: pluginId,
      }));
    },

    registerRpcRouter: (router) => {
      if (CORE_RPC_NAMESPACES.has(pluginId)) {
        throw PluginContextError.pluginIdCollidesWithCoreRpcNamespace({
          pluginId,
          coreNamespaces: [...CORE_RPC_NAMESPACES],
        });
      }
      // Keyed by the plugin's own id, so only the plugin itself can hold it.
      assertUnclaimed(
        "plugin RPC router",
        pluginId,
        pluginId,
        registry.rpcRouters.has(pluginId)
          ? { registeredBy: pluginId }
          : undefined,
      );
      registry.rpcRouters.set(pluginId, router);
    },

    registerMcpTool: (tool) => {
      // Core's tools are served outside the registry, so their names are
      // claimed here rather than by a seeded entry.
      assertUnclaimed(
        "MCP tool",
        tool.name,
        pluginId,
        CORE_MCP_TOOL_NAMES.has(tool.name) ? { registeredBy: null } : undefined,
      );
      claimKey(registry.mcpTools, "MCP tool", tool.name, pluginId, () => ({
        tool,
        registeredBy: pluginId,
      }));
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
      const existing = registry.rawRoutes.find(
        (route) =>
          route.pluginId === pluginId &&
          route.method === method &&
          route.path === path,
      );
      assertUnclaimed(
        "route",
        `${method} ${path}`,
        pluginId,
        existing && { registeredBy: existing.pluginId },
      );
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
      // from `afterSetup`, so the full set exists only once every plugin has.
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
      claimKey(
        registry.adminPages,
        "admin page",
        options.path,
        pluginId,
        () => {
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
          return { ...options, registeredBy: pluginId };
        },
      );
    },

    registerDashboardWidget: (options) => {
      assertNamespacedId("dashboard widget id", options.id, pluginId);
      claimKey(
        registry.dashboardWidgets,
        "dashboard widget",
        options.id,
        pluginId,
        () => {
          assertComponentRef(
            pluginId,
            `dashboard widget "${options.id}"`,
            options.component,
          );
          return { ...options, registeredBy: pluginId };
        },
      );
    },

    registerFieldType: (options) => {
      assertValidFieldTypeName(pluginId, options.type);
      claimKey(
        registry.fieldTypes,
        "field type",
        options.type,
        pluginId,
        () => {
          assertComponentRef(
            pluginId,
            `field type "${options.type}"`,
            options.component,
          );
          return { ...options, registeredBy: pluginId };
        },
      );
    },

    registerBlock: (spec) => {
      if (isReservedBlockName(spec.name)) {
        throw PluginContextError.blockNameReserved({
          pluginId,
          name: spec.name,
        });
      }
      claimKey(registry.blockSpecs, "block", spec.name, pluginId, () => ({
        spec,
        registeredBy: pluginId,
      }));
    },

    registerBlocks: (specs) => {
      for (const spec of specs) ctx.registerBlock(spec);
    },

    registerMark: (spec) => {
      claimKey(registry.markSpecs, "mark", spec.name, pluginId, () => ({
        spec,
        registeredBy: pluginId,
      }));
    },

    registerShortcode: (spec) => {
      claimKey(
        registry.shortcodeSpecs,
        "shortcode",
        spec.name,
        pluginId,
        () => ({
          spec,
          registeredBy: pluginId,
        }),
      );
    },

    registerPattern: (spec) => {
      claimKey(registry.patternSpecs, "pattern", spec.name, pluginId, () => ({
        spec,
        registeredBy: pluginId,
      }));
    },

    registerImageRole: (name, { single }) => {
      claimKey(registry.imageRoles, "image role", name, pluginId, () => ({
        name,
        single,
        registeredBy: pluginId,
      }));
    },

    registerLookupAdapter: (options) => {
      assertValidLookupAdapterKind(pluginId, options.kind);
      // Spread to preserve plugin-contributed option fields (e.g. the
      // `menuPicker` field that @plumix/plugin-menu adds via declaration
      // merging).
      claimKey(
        registry.lookupAdapters,
        "lookup adapter",
        options.kind,
        pluginId,
        () => ({
          ...options,
          capability: options.capability ?? null,
          registeredBy: pluginId,
        }),
      );
    },

    registerLoginLink: (options) => {
      assertValidLoginLink(pluginId, options);
      assertUnclaimed(
        "login link",
        options.key,
        pluginId,
        registry.loginLinks.find(
          (link) => link.registeredBy === pluginId && link.key === options.key,
        ),
      );
      registry.loginLinks.push({
        ...options,
        registeredBy: pluginId,
      });
    },

    registerScheduledTask: (task) => {
      assertValidScheduledTask(pluginId, task);
      assertUnclaimed(
        "scheduled task",
        task.id,
        pluginId,
        registry.scheduledTasks.find(
          (existing) =>
            existing.registeredBy === pluginId && existing.id === task.id,
        ),
      );
      registry.scheduledTasks.push({
        ...task,
        registeredBy: pluginId,
      });
    },

    registerTemplateDep: (kind, { keyedBy, load }) => {
      if (RESERVED_DEP_KIND_NAMES.has(kind)) {
        // Reserved framework keys would silently no-op at request time
        // since the merger skips them on theme/template traversal.
        throw PluginContextError.templateDepKindReserved({
          pluginId,
          kind,
        });
      }
      claimKey(registry.templateDeps, "template dep", kind, pluginId, () => {
        const name = `${keyedBy}s`;
        const erased: RegisteredTemplateDep["load"] = (keys, ctx) =>
          // `keyedBy` is typed to the entry's key field, so this object is
          // exactly the one named array the loader was typed against.
          load({ [name]: keys } as TemplateDepKeys<typeof kind>, ctx);
        return { kind, load: erased, registeredBy: pluginId };
      });
    },
  };

  return ctx;
}

interface Owned {
  readonly registeredBy: string | null;
}

// The one place a duplicate registration is raised, so every registry reports
// who already holds the identifier the same way.
function assertUnclaimed(
  kind: string,
  identifier: string,
  pluginId: string,
  existing: Owned | undefined,
): void {
  if (existing === undefined) return;
  throw DuplicateRegistrationError.alreadyRegistered({
    kind,
    identifier,
    pluginId,
    previousOwner: existing.registeredBy,
  });
}

// `build` runs between the check and the write, so a registrar's remaining
// validation keeps its place after the duplicate check and a throw from it
// leaves the registry untouched.
function claimKey<V extends Owned>(
  map: Map<string, V>,
  kind: string,
  key: string,
  pluginId: string,
  build: () => V,
): V {
  assertUnclaimed(kind, key, pluginId, map.get(key));
  const value = build();
  map.set(key, value);
  return value;
}

function withExtensions<TContext extends PluginSetupContextBase>(
  ctx: TContext,
  extensions: ReadonlyMap<string, unknown> | undefined,
): TContext & PluginContextExtensions {
  if (extensions && extensions.size > 0) {
    // Safety: the write is keyed, never structural — every key that already
    // exists is rejected below, so no declared field of the setup context can
    // be reached through this view.
    const target = ctx as unknown as Record<string, unknown>;
    for (const [key, value] of extensions) {
      // `plugins` is named because the setup context lacks it, so `in` alone
      // would reject the key only once some plugin declared `afterSetup`.
      if (key in target || key === "plugins") {
        throw PluginContextError.extensionShadowsBuiltin({ key });
      }
      target[key] = value;
    }
  }

  return ctx as TContext & PluginContextExtensions;
}

// Three meta-box registrations (entry/term/user) only differ in their
// target Map and the human-facing kind label — extracted into a
// factory so the call sites read as data, not three near-identical
// blocks. Fluent builders in `options.fields` compile to plain
// definitions here, so the registered shape (and everything
// downstream) carries `MetaBoxField` only.
function makeMetaBoxRegistrar<R extends Owned & { readonly id: string }>(
  map: Map<string, R>,
  kind: string,
  pluginId: string,
): (
  id: string,
  options: { readonly fields: readonly MetaBoxFieldInput[] },
) => void {
  return (id, options) => {
    claimKey(map, kind, id, pluginId, () => {
      const fields = compileMetaBoxFields(options.fields);
      assertMetaBoxFields(kind, id, fields);
      // Safety: every member `R` declares is present on the value — `id`,
      // `registeredBy` and `fields` are written here, and `R`'s remaining
      // members ride in on `options`, which the caller passes whole. The
      // compiler can't see the second half because the parameter is typed down
      // to the one field this factory reads.
      return {
        ...options,
        fields,
        id,
        registeredBy: pluginId,
      } as unknown as R;
    });
  };
}

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };
