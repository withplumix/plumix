import type {
  BlockPattern,
  BlockSpec,
  MarkSpec,
  ShortcodeSpec,
} from "../blocks/index.js";
import type { AppContext } from "../context/app-context.js";
import type { McpTool } from "../context/mcp-tool.js";
import type { UserRole } from "../db/schema/users.js";
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
import type { ImageRoleName } from "../images/contract/role-images.js";
import type { RouteIntent } from "../route/contract/intent.js";
import type { RedirectRule } from "../route/contract/redirects.js";
import type { TemplateDepLoader } from "../template-deps.js";
import type { ViewResolvedDataOf } from "../template-registry.js";
import type { TemplateDepKeyedBy, TemplateDepRegistry } from "../template.js";
import type {
  EntryMetaBoxDrift,
  SettingsGroupDrift,
  TermMetaBoxDrift,
  UserMetaBoxDrift,
} from "./fields/contributions.js";
import type { ImageRoleOptions } from "./image-roles.js";
import type { LookupAdapterOptions } from "./lookup.js";
import type {
  AdminPageOptions,
  ArchiveTypeDeclaration,
  DashboardWidgetOptions,
  EntryMetaBoxOptions,
  EntryTypeOptions,
  FieldTypeOptions,
  LoginLinkOptions,
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
  ViewOptions,
} from "./manifest.js";
import type { PluginContextExtensions } from "./provides-context.js";

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
   * plugin id — `ctx.registerFilter('meta_tags', ...)` becomes
   * `<plugin>:meta_tags`. Other plugins listen via the full prefixed name.
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
   * The box's fields are also the meta storage schema. Throws
   * `DuplicateRegistrationError` on id collision; `buildManifest` rejects two
   * boxes writing the same `(entryType, field.key)`.
   */
  registerEntryMetaBox<Id extends string, const O extends EntryMetaBoxOptions>(
    id: Id,
    options: O & EntryMetaBoxDrift<Id, O>,
  ): void;
  /**
   * Same model as `registerEntryMetaBox`, for terms; each box renders as one
   * card on the term edit form.
   */
  registerTermMetaBox<Id extends string, const O extends TermMetaBoxOptions>(
    id: Id,
    options: O & TermMetaBoxDrift<Id, O>,
  ): void;

  /**
   * Same model as `registerEntryMetaBox`. The user meta keyspace is flat, so
   * every box targets every user; gate visibility with `capability`.
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
   * Fields store under `settings(group.name, field.name)` and render as one
   * card with its own save button. Throws `DuplicateRegistrationError` on a
   * name clash. Shown only when a `registerSettingsPage` references it.
   */
  registerSettingsGroup<
    Name extends string,
    const O extends SettingsGroupOptions,
  >(
    name: Name,
    options: O & SettingsGroupDrift<Name, O>,
  ): void;

  /**
   * Admin page at `/settings/<name>` composing registered groups; not stored.
   * Throws `DuplicateRegistrationError` on a name clash. Group references
   * resolve in `buildManifest`, so install order doesn't matter.
   */
  registerSettingsPage(name: string, options: SettingsPageOptions): void;

  /**
   * `priority` defaults to 10 (lower wins; entry-type rules use 50). An `entry`
   * intent with `slug` serves that entry at every match. Static-asset
   * extensions 404 before routing and never match.
   */
  registerRewriteRule(
    pattern: string,
    intent: RouteIntent,
    options?: { readonly priority?: number },
  ): void;

  /**
   * Matched ahead of the content route map, so a redirect shadows a page.
   * Plugin rules default to priority 20 (lower wins) and merge with
   * `config.redirects` and the theme's.
   */
  registerRedirects(rules: readonly RedirectRule[]): void;

  /**
   * With `entries`, core pages, orders and 404s past the last page; without,
   * `resolve` returns the whole payload or `null`. Augment
   * `ArchiveTypeRegistry` with `name` to type `data`. Duplicate names throw.
   */
  registerArchiveType(name: string, options: ArchiveTypeDeclaration): void;

  /**
   * `resolve` returns `{ data, title, tags? }`, `null` (404), or throws
   * `pageNotFound()`/`redirectTo()`. Never CDN-stored unless `cacheable: true`;
   * no automatic canonical. Augment `ViewRegistry` to type `data`; duplicate
   * names throw.
   */
  registerView<K extends string>(
    name: K,
    options: ViewOptions<ViewResolvedDataOf<K>>,
  ): void;

  /** Mounted at `/_plumix/rpc/<pluginId>/*`. */
  registerRpcRouter(router: PluginRpcRouter): void;

  /**
   * Tool names are global snake_case; a collision with a core or plugin tool
   * throws. `run` delegates to a service — MCP never calls oRPC.
   */
  registerMcpTool(tool: McpTool): void;

  /**
   * `cacheable` and `formPost` throw unless `auth: "public"`. `cacheable`
   * stores a GET by full URL, ignoring cookies and `Vary`. A `formPost` request
   * skips the `X-Plumix-Request` check and authenticates nobody.
   */
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
   * Always answers, ahead of redirects and pages; GET/HEAD only. Without
   * `access`, `ctx.user` is null. `ctx.request` has `basePath` stripped: build
   * URLs from `ctx.origin` + `ctx.config.basePath`. Duplicate paths throw.
   */
  registerPublicRoute(options: PublicRouteOptions): void;

  /**
   * An oRPC resource merged into the public REST router and `openapi.json`.
   * Core enforces `auth`, then binds `{collection}` and `{entry}`. Path
   * collisions throw at boot.
   */
  registerRestResource<Path extends string>(
    options: RestResourceOptions<Path>,
  ): void;

  registerAdminPage(options: AdminPageOptions): void;
  registerDashboardWidget(options: DashboardWidgetOptions): void;
  registerFieldType(options: FieldTypeOptions): void;
  /**
   * Merges with precedence theme > plugin > core; the `core/` namespace is
   * reserved and throws.
   */
  registerBlock(spec: BlockSpec): void;

  /**
   * Register several blocks at once — the array ergonomic of `registerBlock`,
   * mirroring the theme `blocks` field. Equivalent to calling `registerBlock`
   * for each spec (same `core/` and duplicate-name guards apply per spec).
   */
  registerBlocks(specs: readonly BlockSpec[]): void;

  /**
   * Names colliding with core marks throw; name plugin marks
   * `pluginId/markName`.
   */
  registerMark(spec: MarkSpec): void;
  /**
   * Duplicate tags throw — tags are flat and unprefixed. Server-only: the
   * editor canvas shows its raw `[tag]`; declare it in the descriptor's
   * `shortcodes` to expand there too.
   */
  registerShortcode(spec: ShortcodeSpec): void;
  /**
   * Offered by the editor's inserter, and the starter modal when it declares
   * `target`; inserting copies its body. Duplicate slugs throw.
   */
  registerPattern(spec: BlockPattern): void;
  /**
   * `kind` matches a reference field's `referenceTarget.kind`; core ships
   * `entry`, `term` and `user`. Duplicate kinds throw.
   */
  registerLookupAdapter(options: LookupAdapterOptions): void;
  /**
   * `single` caps each scope at one field in the role. Core registers
   * `featured` and `ogImage`; duplicates throw. Augment `ImageRoles` so the
   * name type-checks here and in `.role()`.
   */
  registerImageRole(name: ImageRoleName, options: ImageRoleOptions): void;

  /**
   * Only adds the login-screen button; the plugin registers the flow's routes
   * itself.
   */
  registerLoginLink(options: LoginLinkOptions): void;

  /**
   * The handler's `AppContext` has `user: null` and a synthetic `request`. `id`
   * is unique per plugin. A task with `cron` runs only on an exactly matching
   * firing; without, on every firing.
   */
  registerScheduledTask(task: ScheduledTask): void;
  /**
   * Two plugins registering one `kind` is a boot error. Augment
   * `TemplateDepRegistry` in a file the theme's program imports, e.g. beside
   * the result type exported from `/server`.
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
   * Live and read-only; holds every `setup` registration. Another plugin's
   * `afterSetup` registrations appear only if it runs earlier in the array.
   */
  readonly plugins: PluginRegistry;
};

// Re-exported from our local FilterRest helper so the type used by hook wrapper
// logic is expressible at call sites without digging into internals.
export type { ActionArgs, FilterInput, FilterRest };
