import type {
  AnyRouter,
  InferRouterInputs,
  InferRouterOutputs,
  RouterClient,
} from "@orpc/server";

import type {
  Capability,
  EntryTypeCapabilityOverrides,
  TermTaxonomyCapabilityOverrides,
} from "../access/contract/capability.js";
import type { AccessPolicyFor } from "../access/contract/policy.js";
import type {
  BlockPattern,
  BlockSpec,
  MarkSpec,
  ShortcodeSpec,
} from "../blocks/index.js";
import type { AppContext } from "../context/app-context.js";
import type { McpTool } from "../context/mcp-tool.js";
import type { Entry } from "../db/schema/entries.js";
import type { UserRole } from "../db/schema/users.js";
import type { EntryQuery } from "../entries/contract/query.js";
import type { Label } from "../i18n/label.js";
import type { RestErrors } from "../rest/contract/errors.js";
import type { EntryListing } from "../route/contract/entry-listing.js";
import type { FrameworkRoutes } from "../route/contract/framework-routes.js";
import type { RouteIntent } from "../route/contract/intent.js";
import type { RedirectRule } from "../route/contract/redirects.js";
import type { ArchiveTypeData } from "../route/contract/resolved-entry.js";
import type { RegisteredTemplateDep } from "../template-deps.js";
import type {
  MetaBoxField,
  MetaBoxFieldInput,
} from "./fields/meta-box-field.js";
import type { RegisteredImageRole } from "./image-roles.js";
import type { RegisteredLookupAdapter } from "./lookup.js";
import { resolveFrameworkRoutes } from "../route/contract/framework-routes.js";

/**
 * Per-type admin labels, modelled on WordPress's `register_post_type()` labels.
 * An unset key falls back to a generic catalog string.
 */
export interface EntryTypeLabels {
  /** Identity */
  readonly singular?: Label;
  readonly plural?: Label;
  // Create / read / update / delete actions
  /** "Add New" — short-form CTA for the admin bar quick-create overflow. */
  readonly addNew?: Label;
  /** "Add Post" — primary create CTA on list and create pages. */
  readonly addNewItem?: Label;
  /** "Edit Post" — list-table row action and editor heading. */
  readonly editItem?: Label;
  /** "New Post" — quick-create affordance distinct from `addNewItem`. */
  readonly newItem?: Label;
  /** "View Post" — list-table row action and post-save toast link. */
  readonly viewItem?: Label;
  /** "View Posts" — plural archive-link variant of `viewItem`. */
  readonly viewItems?: Label;
  // List page chrome
  /** "Search Posts…" — list-page search input placeholder. */
  readonly searchItems?: Label;
  /** "No posts yet" — list-page empty state title (no rows registered). */
  readonly notFound?: Label;
  /** "No posts found in Trash" — trash view empty state. */
  readonly notFoundInTrash?: Label;
  /** "Loading posts" — aria-busy state during list fetch. */
  readonly loadingItems?: Label;
  /** "Couldn't load posts. Try again." — list-page fetch-failure banner. */
  readonly loadErrorItems?: Label;
  /** "All posts" — "all-types" filter chip label. */
  readonly allItems?: Label;
  /** "No posts match" — empty state after a search returns zero rows. */
  readonly noMatch?: Label;
  /** "Parent Post" — hierarchical parent picker option label. */
  readonly parentItem?: Label;
  /** "Parent Post:" — colon-suffixed variant for form labels. */
  readonly parentItemColon?: Label;
  // Reference picker / lookup
  /** "Untitled Post" — reference-picker label when an entry has no title. */
  readonly untitledItem?: Label;
  // Trash / status flow
  /** "Move post to trash?" — confirmation prompt on trash action. */
  readonly moveToTrash?: Label;
}

/** A value outside this set falls back to `"content"` in the manifest. */
export const ENTRY_MENU_ICONS = [
  "content",
  "file-text",
  "layout",
  "image",
  "calendar",
] as const;
export type EntryMenuIcon = (typeof ENTRY_MENU_ICONS)[number];

/** Closed set `TermTaxonomyOptions.menuIcon` accepts — see `EntryMenuIcon`. */
export const TAXONOMY_MENU_ICONS = ["tag", "folder"] as const;
export type TaxonomyMenuIcon = (typeof TAXONOMY_MENU_ICONS)[number];

export interface EntryTypeOptions {
  readonly label: Label;
  /**
   * `plural` also drives the admin URL slug; without it the slug is `${name}s`,
   * so set it for irregular plurals.
   */
  readonly labels?: EntryTypeLabels;
  readonly description?: Label;
  readonly supports?: readonly string[];
  readonly termTaxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  /**
   * Master visibility switch; defaults to `true`. Cascades to
   * `showUI`/`showInSidebar`/`excludeFromSearch` when those are unset.
   */
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly excludeFromSearch?: boolean;
  readonly hasArchive?: boolean | string;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
  readonly capabilityType?: string;
  readonly capabilities?: EntryTypeCapabilityOverrides;
  readonly priority?: number;
  readonly menuIcon?: EntryMenuIcon;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
  /**
   * Honored only when `supports` includes `"revisions"`. Defaults:
   * `maxRevisions` 25, `autosaveIntervalSeconds` 60.
   */
  readonly versioning?: {
    readonly maxRevisions?: number;
    readonly autosaveIntervalSeconds?: number;
  };
  /** Page size for this type's archive route. Default 20. */
  readonly archivePerPage?: number;
  /**
   * Gates only the entry's own single and archive routes. A gated entry still
   * surfaces on aggregates (front page, archives, search, feeds, sitemap).
   */
  readonly access?: EntryTypeAccess;
}

export interface EntryTypeAccess {
  /**
   * Also applies when an entry's stored choice names a key no longer in {@link
   * policies}.
   */
  readonly default: AccessPolicyFor<AppContext>;
  /**
   * Policies an editor may assign per entry, in addition to the implicit
   * `default`.
   */
  readonly policies?: readonly SelectableAccessPolicy[];
}

/**
 * `key` is persisted on the entry, so it must stay stable. `policy` never
 * leaves the server.
 */
export interface SelectableAccessPolicy {
  readonly key: string;
  readonly label: Label;
  readonly policy: AccessPolicyFor<AppContext>;
}

/**
 * Per-taxonomy admin labels; an unset key falls back to a generic catalog
 * string.
 */
export interface TermTaxonomyLabels {
  readonly singular?: Label;
  /** "Categories" — plural form (symmetric with `EntryTypeLabels.plural`). */
  readonly plural?: Label;
  /** "Add New" — short-form CTA paired with `addNewItem`. */
  readonly addNew?: Label;
  /** "Add Category" — primary create CTA. */
  readonly addNewItem?: Label;
  /** "Edit Category" — term-edit form heading. */
  readonly editItem?: Label;
  /** "View Category" — list-table row action linking to the public archive. */
  readonly viewItem?: Label;
  /** "Update Category" — save-button text on the term edit form. */
  readonly updateItem?: Label;
  /** "New Category Name" — placeholder for the create-form name input. */
  readonly newItemName?: Label;
  /** "Search categories…" — list-page search input placeholder. */
  readonly searchItems?: Label;
  /** "No categories yet" — list-page empty state title. */
  readonly notFound?: Label;
  /** "Loading categories" — aria-busy state during fetch. */
  readonly loadingItems?: Label;
  /** "Couldn't load categories. Try again." — fetch-failure banner. */
  readonly loadErrorItems?: Label;
  /** "All categories" — filter chip label. */
  readonly allItems?: Label;
  /** "No categories match" — empty state after zero-match search. */
  readonly noMatch?: Label;
  /** "Parent Category" — hierarchical parent picker option label. */
  readonly parentItem?: Label;
  /** "Parent Category:" — colon-suffixed variant for form labels. */
  readonly parentItemColon?: Label;
  /** "No categories" — entry-list cell empty placeholder. */
  readonly noTerms?: Label;
  /** "Filter by category" — SR-only label on filter dropdown. */
  readonly filterByItem?: Label;
  /** "← Go to Categories" — back-link from term edit to list. */
  readonly backToItems?: Label;
  /** "Categories list" — SR-only region label for the data table. */
  readonly itemsList?: Label;
  /** "Categories list navigation" — SR-only region label for pagination. */
  readonly itemsListNavigation?: Label;
  /** "Separate tags with commas" — help text for chip-style multi-input
   *  pickers (non-hierarchical only; categories don't use it). */
  readonly separateItemsWithCommas?: Label;
  /** "Add or remove tags" — help text for chip-style picker controls. */
  readonly addOrRemoveItems?: Label;
}

export interface TermTaxonomyOptions {
  readonly label: Label;
  readonly labels?: TermTaxonomyLabels;
  readonly description?: Label;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  /**
   * Defaults to `!isPublic`. Public search only; the admin command palette
   * ignores it.
   */
  readonly excludeFromSearch?: boolean;
  readonly isInQuickEdit?: boolean;
  readonly hasAdminColumn?: boolean;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
  readonly capabilities?: TermTaxonomyCapabilityOverrides;
  readonly menuIcon?: TaxonomyMenuIcon;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
  /** Page size for this taxonomy's term archives. Default 20. */
  readonly archivePerPage?: number;
}

type ResolvedVisibility = Pick<
  RegisteredEntryType,
  "isPublic" | "showUI" | "showInSidebar" | "excludeFromSearch"
>;

function resolveVisibility(
  options: EntryTypeOptions | TermTaxonomyOptions,
): ResolvedVisibility {
  const isPublic = options.isPublic ?? true;
  const showUI = options.showUI ?? isPublic;
  return {
    isPublic,
    showUI,
    showInSidebar: options.showInSidebar ?? showUI,
    excludeFromSearch: options.excludeFromSearch ?? !isPublic,
  };
}

/**
 * The registered shape of an entry type. Visibility and the capability
 * namespace are resolved here, once, so no reader re-derives a default with
 * its own spelling of it.
 */
export function toRegisteredEntryType(
  name: string,
  options: EntryTypeOptions,
  registeredBy: string | null,
): RegisteredEntryType {
  return {
    ...options,
    ...resolveVisibility(options),
    name,
    registeredBy,
    capabilityType: options.capabilityType ?? name,
  };
}

/**
 * The registered shape of a term taxonomy; see {@link toRegisteredEntryType}.
 */
export function toRegisteredTermTaxonomy(
  name: string,
  options: TermTaxonomyOptions,
  registeredBy: string | null,
): RegisteredTermTaxonomy {
  return {
    ...options,
    ...resolveVisibility(options),
    name,
    registeredBy,
  };
}

/**
 * `capability` only hides the card in the admin. The server enforces the
 * entity's write gate, so never rely on it to protect secrets.
 */
export interface MetaBoxBaseOptions {
  readonly label: Label;
  readonly description?: Label;
  readonly priority?: number;
  readonly capability?: Capability;
  readonly fields: readonly MetaBoxFieldInput[];
}

/**
 * Fields' `span` is ignored here: the editor rail is too narrow, so every field
 * takes the full row.
 */
export interface EntryMetaBoxOptions extends MetaBoxBaseOptions {
  /** @deprecated Ignored: every entry meta box renders in the editor rail. */
  readonly location?: "bottom" | "sidebar";
  readonly entryTypes: readonly string[];
}

/**
 * Meta box shown on the termTaxonomy term edit form. Scoped by
 * `termTaxonomies`.
 */
export interface TermMetaBoxOptions extends MetaBoxBaseOptions {
  readonly termTaxonomies: readonly string[];
}

export type UserMetaBoxOptions = MetaBoxBaseOptions;

/**
 * A settings group is both a storage unit and a visual unit, saved
 * independently of other groups.
 */
export type SettingsGroupOptions = MetaBoxBaseOptions;

/** Pages are not stored; a group may appear on several pages. */
export interface SettingsPageOptions {
  readonly label: Label;
  readonly description?: Label;
  readonly groups: readonly string[];
  /**
   * Admin menu ordering. Unspecified positions sort last (in
   * registration order). Mirrors `EntryTypeOptions.priority` so
   * sidebar composition stays predictable across plugins.
   */
  readonly priority?: number;
}

export interface RegisteredEntryType extends EntryTypeOptions {
  readonly name: string;
  readonly registeredBy: string | null;
  /**
   * The namespace this type's `entry:<capabilityType>:*` capabilities live
   * under: the type's own name unless it pools with another.
   */
  readonly capabilityType: string;
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly excludeFromSearch: boolean;
}

export interface RegisteredTermTaxonomy extends TermTaxonomyOptions {
  readonly name: string;
  readonly registeredBy: string | null;
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly excludeFromSearch: boolean;
}

// Registered shapes hold *compiled* fields — fluent builders are
// built at registration time, so everything downstream (write
// pipeline, manifest projection) sees plain `MetaBoxField` values.

export interface RegisteredEntryMetaBox extends EntryMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
  readonly fields: readonly MetaBoxField[];
}

export interface RegisteredTermMetaBox extends TermMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
  readonly fields: readonly MetaBoxField[];
}

export interface RegisteredUserMetaBox extends UserMetaBoxOptions {
  readonly id: string;
  readonly registeredBy: string | null;
  readonly fields: readonly MetaBoxField[];
}

export interface RegisteredSettingsGroup extends SettingsGroupOptions {
  readonly name: string;
  readonly registeredBy: string | null;
  readonly fields: readonly MetaBoxField[];
}

export interface RegisteredSettingsPage extends SettingsPageOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

export interface RegisteredCapability {
  readonly name: string;
  readonly minRole: UserRole;
  /**
   * Roles granted the capability regardless of hierarchy: a role qualifies if
   * it meets `minRole` or appears here.
   */
  readonly defaultGrants?: readonly UserRole[];
  readonly registeredBy: string | null;
}

export interface RegisteredRewriteRule {
  readonly pattern: string;
  readonly intent: RouteIntent;
  readonly priority: number;
  readonly registeredBy: string | null;
}

/**
 * The render payload an archive-type resolver produces, or `null` for a 404.
 */
export interface CustomArchiveResolution {
  readonly data: ArchiveTypeData;
  readonly title: string;
  /**
   * CDN tags for the content this archive lists, typically {@link typeTag} per
   * entry type. Ignored unless the archive is `cacheable`.
   */
  readonly tags?: readonly string[];
}

/**
 * `data` is merged under core's `entries` and `pagination`, so it carries only
 * the archive's own fields.
 */
export interface ListingArchiveResolution {
  readonly data?: ArchiveTypeData;
}

/**
 * For an archive that declared no `title`: only the resolver, having loaded the
 * subject, can name the page.
 */
export interface TitledListingArchiveResolution extends ListingArchiveResolution {
  readonly title: string;
}

/**
 * Narrows the query core hands in; `null` is a 404. Must stay synchronous and
 * query-free, so a render can ask what an archive contains for free.
 */
export type ArchiveEntries = (
  q: EntryQuery,
  params: Record<string, string>,
) => EntryQuery | null;

/** An archive's document title, fixed or derived from its route params. */
export type ArchiveTitle =
  string | ((params: Record<string, string>) => string);

/**
 * The options every archive type shares. An option only an archive with
 * `entries` can take goes on {@link ListingArchiveTypeOptions} instead.
 */
export interface ArchiveTypeOptions {
  /** URLPattern pathnames that dispatch to this archive (`/events/:series`). */
  readonly routes: readonly string[];
  /** Route priority (lower wins); defaults to the rewrite-rule priority. */
  readonly priority?: number;
  /**
   * Off by default: core can't know a custom archive's dependencies. An archive
   * with `entries` is tagged by core; one without must return {@link
   * CustomArchiveResolution.tags}.
   */
  readonly cacheable?: boolean;
  /** A policied archive always renders live, bypassing the CDN. */
  readonly access?: AccessPolicyFor<AppContext>;
}

/**
 * An augmentation adding an option here must also add it as `field?: undefined`
 * on {@link UnlistedArchiveTypeOptions}, so it fails to compile there.
 */
export interface ListingArchiveTypeOptions extends ArchiveTypeOptions {
  readonly entries: ArchiveEntries;
  /**
   * Core derives a `/page/:page` form of every route and 404s past the last
   * page. Defaults to 20.
   */
  readonly perPage?: number;
}

type ListingArchiveResolve<TResolution extends ListingArchiveResolution> = (
  ctx: AppContext,
  params: Record<string, string>,
  listing: EntryListing,
) => Promise<TResolution | null> | TResolution | null;

interface TitledListingArchiveOptions extends ListingArchiveTypeOptions {
  readonly title: ArchiveTitle;
  readonly resolve?: ListingArchiveResolve<ListingArchiveResolution>;
}

interface ResolvedListingArchiveOptions extends ListingArchiveTypeOptions {
  readonly title?: undefined;
  readonly resolve: ListingArchiveResolve<TitledListingArchiveResolution>;
}

/**
 * For an archive whose results are a match rather than a set, such as search.
 * It cannot have a feed.
 */
export interface UnlistedArchiveTypeOptions extends ArchiveTypeOptions {
  readonly entries?: undefined;
  /**
   * `null` is a 404. May throw `pageNotFound()` or `redirectTo()` from
   * `plumix/support`.
   */
  readonly resolve: (
    ctx: AppContext,
    params: Record<string, string>,
  ) => Promise<CustomArchiveResolution | null> | CustomArchiveResolution | null;
}

/**
 * An archive that declares `entries` must still name its page, through `title`
 * or a `resolve` that returns one.
 */
export type ArchiveTypeDeclaration =
  | TitledListingArchiveOptions
  | ResolvedListingArchiveOptions
  | UnlistedArchiveTypeOptions;

export type RegisteredArchiveType = ArchiveTypeDeclaration & {
  readonly name: string;
  readonly registeredBy: string | null;
};

/**
 * What a view's resolver produces: the `data` its template receives under
 * `data.data`, the document title, and — for a view that opted into the CDN —
 * the tags that purge it.
 */
export interface ViewResolution<TData = unknown> {
  readonly data: TData;
  readonly title: string;
  /** Ignored unless the view is `cacheable`. */
  readonly tags?: readonly string[];
}

/**
 * A per-visitor page (sign-in, account) rendered through the theme; it lists
 * nothing, so has no entries, paging or feed.
 */
export interface ViewOptions<TData = unknown> {
  /** URLPattern pathnames that dispatch to this view (`/compare/:id`). */
  readonly routes: readonly string[];
  readonly access?: AccessPolicyFor<AppContext>;
  /**
   * Off by default because a view usually differs per visitor. Pair it with
   * {@link ViewResolution.tags}.
   */
  readonly cacheable?: boolean;
  /**
   * `null` is a 404. May throw `pageNotFound()` or `redirectTo()` from
   * `plumix/support`.
   */
  readonly resolve: (
    ctx: AppContext,
    params: Record<string, string>,
  ) => Promise<ViewResolution<TData> | null> | ViewResolution<TData> | null;
}

export type RegisteredView = ViewOptions & {
  readonly name: string;
  readonly registeredBy: string | null;
};

/** An export name on the registering plugin's `adminEntry` module. */
export type PluginComponentRef = string;

/**
 * The first page using a group id sets its label and priority. Core group ids
 * ignore inline metadata.
 */
export type AdminNavGroupRef =
  | string
  | {
      readonly id: string;
      readonly label?: Label;
      readonly priority?: number;
    };

export interface AdminPageOptions {
  readonly path: string;
  readonly title: Label;
  readonly nav?: {
    readonly group: AdminNavGroupRef;
    readonly label: Label;
    readonly icon?: PluginComponentRef;
    readonly order?: number;
    /** Synonyms the command palette matches in addition to `label`. */
    readonly keywords?: readonly Label[];
  };
  readonly capability?: Capability;
  readonly component: PluginComponentRef;
}

export interface RegisteredAdminPage extends AdminPageOptions {
  readonly registeredBy: string | null;
}

export interface DashboardWidgetOptions {
  /** Unique widget id, conventionally `<pluginId>:<name>`. */
  readonly id: string;
  readonly title: Label;
  /** Hidden unless the viewer holds this capability (when set). */
  readonly capability?: Capability;
  /** Export name in the plugin's admin chunk, resolved at render. */
  readonly component: PluginComponentRef;
  /** Lower sorts first on the dashboard; unset sorts last. */
  readonly priority?: number;
}

export interface RegisteredDashboardWidget extends DashboardWidgetOptions {
  readonly registeredBy: string | null;
}

/**
 * Renders every field whose `inputType` equals `type`, on any surface.
 * Unregistered input types fall back to a text input.
 */
export interface FieldTypeOptions {
  readonly type: string;
  readonly component: PluginComponentRef;
}

export interface RegisteredFieldType extends FieldTypeOptions {
  readonly registeredBy: string | null;
}

export type PluginRouteMethod =
  "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS" | "*";

/**
 * `"development"` 404s unless `plumix dev` runs and the request is loopback.
 * Use it for authoring internals; a tunnel or forwarded port bypasses
 * `"public"`.
 */
export type PluginRouteAuth =
  | "public"
  | "authenticated"
  | "development"
  | { readonly capability: Capability };

export interface RegisteredRawRoute {
  readonly pluginId: string;
  readonly method: PluginRouteMethod;
  readonly path: string;
  readonly auth: PluginRouteAuth;
  readonly cacheable?: boolean;
  /** Drops the CSRF header requirement so a plain HTML form can post. */
  readonly formPost?: boolean;
  readonly handler: (
    request: Request,
    ctx: AppContext,
  ) => Response | Promise<Response>;
}

export interface PublicRouteOptions {
  /**
   * An exact pathname, or a URLPattern pathname (`/sitemap-post-:page.xml`).
   */
  readonly path: string;
  readonly cacheable?: boolean;
  /**
   * A policied route renders live per reader and never touches the CDN, even
   * when `cacheable`.
   */
  readonly access?: AccessPolicyFor<AppContext>;
  /**
   * `params` carries the pattern's captured groups; `{}` for a literal path.
   */
  readonly handler: (
    request: Request,
    ctx: AppContext,
    params: Record<string, string>,
  ) => Response | Promise<Response>;
}

export interface RegisteredPublicRoute extends PublicRouteOptions {
  readonly pluginId: string;
}

export type RestResourceMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * No `"development"`: a REST resource is published in `openapi.json`, so a
 * dev-only one has nowhere to live.
 */
export type RestResourceAuth = Exclude<PluginRouteAuth, "development">;

type HasPathSegment<
  Path extends string,
  Name extends string,
> = Path extends `${string}{${Name}}${string}` ? true : false;

interface RestResourceBoundEntryType {
  readonly entryType: RegisteredEntryType;
}

interface RestResourceBoundEntry {
  /**
   * Already checked readable by the requester and, with `{collection}`, of that
   * entry type.
   */
  readonly entry: Entry;
}

type RestResourceBindings<Path extends string> = (HasPathSegment<
  Path,
  "collection"
> extends true
  ? RestResourceBoundEntryType
  : unknown) &
  (HasPathSegment<Path, "entry"> extends true
    ? RestResourceBoundEntry
    : unknown);

/**
 * `entryType` and `entry` are present only when `Path` has the reserved
 * `{collection}` / `{entry}` segments.
 */
export type RestResourceHandlerArgs<Path extends string = string> = {
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any -- one registry slot holds every plugin's heterogeneous valibot schemas */
  readonly input: any;
  readonly context: AppContext;
  readonly errors: RestErrors;
} & RestResourceBindings<Path>;

/**
 * `path` is relative to `/_plumix/api/v1/`. An unbindable `{collection}` or
 * `{entry}` is a `NOT_FOUND` before the handler runs. `output` is the public
 * allowlist.
 */
export interface RestResourceOptions<Path extends string = string> {
  readonly method?: RestResourceMethod;
  readonly path: Path;
  readonly auth: RestResourceAuth;
  /* eslint-disable @typescript-eslint/no-explicit-any -- one registry slot holds every plugin's heterogeneous valibot schemas */
  readonly input?: any;
  readonly output: any;
  handler(args: RestResourceHandlerArgs<Path>): any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface RegisteredRestResource extends Omit<
  RestResourceOptions,
  "handler"
> {
  readonly pluginId: string;
  readonly method: RestResourceMethod;
  /**
   * Method syntax on purpose: each resource's handler is typed from its own
   * path, and core supplies exactly the bindings that path names.
   */
  handler(
    args: RestResourceHandlerArgs &
      Partial<RestResourceBoundEntryType & RestResourceBoundEntry>,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the output schema, not this type, is what a resource's response is held to
  ): any;
}

/**
 * Only the login-screen button; the flow itself is registered separately with
 * `registerRoute` and `resolveExternalIdentity`.
 */
export interface LoginLinkOptions {
  /**
   * Unique within the plugin only. Lowercase alphanumerics, `-` or `_`,
   * starting with a letter, 1–32 characters.
   */
  readonly key: string;
  /** Must not contain CR or LF. */
  readonly label: string;
  /**
   * A `/`-relative path or an `https://` URL; other schemes are rejected so a
   * plugin can't surface a `javascript:` link.
   */
  readonly href: string;
}

export interface RegisteredLoginLink extends LoginLinkOptions {
  readonly registeredBy: string;
}

/**
 * The handler's context has no `user` and a synthetic `request`. A task with
 * `cron` runs only when the fired schedule byte-matches it; without one, on
 * every trigger.
 */
export interface ScheduledTask {
  readonly id: string;
  readonly cron?: string;
  readonly handler: (ctx: AppContext) => void | Promise<void>;
}

export interface RegisteredScheduledTask extends ScheduledTask {
  readonly registeredBy: string;
}

/**
 * Declare a router's shape with `type`, not `interface`: interfaces get no
 * implicit index signature, so they never assign here.
 */
export type PluginRpcRouter = AnyRouter;

export type PluginRpcClient<TRouter extends PluginRpcRouter> =
  RouterClient<TRouter>;

/** Each procedure's input, keyed the way the router nests them. */
export type PluginRpcInputs<TRouter extends PluginRpcRouter> =
  InferRouterInputs<TRouter>;

/** Each procedure's output, keyed the way the router nests them. */
export type PluginRpcOutputs<TRouter extends PluginRpcRouter> =
  InferRouterOutputs<TRouter>;

export interface RegisteredMcpTool {
  readonly tool: McpTool;
  readonly registeredBy: string;
}

export interface RegisteredBlock {
  readonly spec: BlockSpec;
  readonly registeredBy: string;
}

export interface RegisteredMark {
  readonly spec: MarkSpec;
  readonly registeredBy: string;
}

export interface RegisteredPattern {
  readonly spec: BlockPattern;
  readonly registeredBy: string;
}

export interface RegisteredShortcode {
  readonly spec: ShortcodeSpec;
  readonly registeredBy: string;
}

export interface PluginRegistry {
  /** Ids of the installed plugins, in registration order. */
  readonly pluginIds: readonly string[];
  readonly entryTypes: ReadonlyMap<string, RegisteredEntryType>;
  readonly termTaxonomies: ReadonlyMap<string, RegisteredTermTaxonomy>;
  readonly entryMetaBoxes: ReadonlyMap<string, RegisteredEntryMetaBox>;
  readonly termMetaBoxes: ReadonlyMap<string, RegisteredTermMetaBox>;
  readonly userMetaBoxes: ReadonlyMap<string, RegisteredUserMetaBox>;
  readonly capabilities: ReadonlyMap<string, RegisteredCapability>;
  readonly settingsGroups: ReadonlyMap<string, RegisteredSettingsGroup>;
  readonly settingsPages: ReadonlyMap<string, RegisteredSettingsPage>;
  readonly rewriteRules: readonly RegisteredRewriteRule[];
  readonly redirects: readonly RedirectRule[];
  readonly archiveTypes: ReadonlyMap<string, RegisteredArchiveType>;
  readonly views: ReadonlyMap<string, RegisteredView>;
  readonly rpcRouters: ReadonlyMap<string, PluginRpcRouter>;
  readonly mcpTools: ReadonlyMap<string, RegisteredMcpTool>;
  readonly rawRoutes: readonly RegisteredRawRoute[];
  readonly publicRoutes: readonly RegisteredPublicRoute[];
  readonly restResources: readonly RegisteredRestResource[];
  readonly loginLinks: readonly RegisteredLoginLink[];
  readonly adminPages: ReadonlyMap<string, RegisteredAdminPage>;
  readonly dashboardWidgets: ReadonlyMap<string, RegisteredDashboardWidget>;
  readonly fieldTypes: ReadonlyMap<string, RegisteredFieldType>;
  readonly blockSpecs: ReadonlyMap<string, RegisteredBlock>;
  readonly markSpecs: ReadonlyMap<string, RegisteredMark>;
  readonly patternSpecs: ReadonlyMap<string, RegisteredPattern>;
  readonly shortcodeSpecs: ReadonlyMap<string, RegisteredShortcode>;
  readonly lookupAdapters: ReadonlyMap<string, RegisteredLookupAdapter>;
  readonly scheduledTasks: readonly RegisteredScheduledTask[];
  readonly templateDeps: ReadonlyMap<string, RegisteredTemplateDep>;
  readonly imageRoles: ReadonlyMap<string, RegisteredImageRole>;
  /**
   * Fixed before any plugin runs, so every compile of the route map reads the
   * same answer.
   */
  readonly frameworkRoutes: FrameworkRoutes;
}

export interface MutablePluginRegistry extends PluginRegistry {
  readonly pluginIds: string[];
  readonly entryTypes: Map<string, RegisteredEntryType>;
  readonly termTaxonomies: Map<string, RegisteredTermTaxonomy>;
  readonly entryMetaBoxes: Map<string, RegisteredEntryMetaBox>;
  readonly termMetaBoxes: Map<string, RegisteredTermMetaBox>;
  readonly userMetaBoxes: Map<string, RegisteredUserMetaBox>;
  readonly capabilities: Map<string, RegisteredCapability>;
  readonly settingsGroups: Map<string, RegisteredSettingsGroup>;
  readonly settingsPages: Map<string, RegisteredSettingsPage>;
  readonly rewriteRules: RegisteredRewriteRule[];
  readonly redirects: RedirectRule[];
  readonly archiveTypes: Map<string, RegisteredArchiveType>;
  readonly views: Map<string, RegisteredView>;
  readonly rpcRouters: Map<string, PluginRpcRouter>;
  readonly mcpTools: Map<string, RegisteredMcpTool>;
  readonly rawRoutes: RegisteredRawRoute[];
  readonly publicRoutes: RegisteredPublicRoute[];
  readonly restResources: RegisteredRestResource[];
  readonly loginLinks: RegisteredLoginLink[];
  readonly adminPages: Map<string, RegisteredAdminPage>;
  readonly dashboardWidgets: Map<string, RegisteredDashboardWidget>;
  readonly fieldTypes: Map<string, RegisteredFieldType>;
  readonly blockSpecs: Map<string, RegisteredBlock>;
  readonly markSpecs: Map<string, RegisteredMark>;
  readonly patternSpecs: Map<string, RegisteredPattern>;
  readonly shortcodeSpecs: Map<string, RegisteredShortcode>;
  readonly lookupAdapters: Map<string, RegisteredLookupAdapter>;
  readonly scheduledTasks: RegisteredScheduledTask[];
  readonly templateDeps: Map<string, RegisteredTemplateDep>;
  readonly imageRoles: Map<string, RegisteredImageRole>;
}

export function createPluginRegistry(
  frameworkRoutes: FrameworkRoutes = resolveFrameworkRoutes(),
): MutablePluginRegistry {
  return {
    pluginIds: [],
    entryTypes: new Map(),
    termTaxonomies: new Map(),
    entryMetaBoxes: new Map(),
    termMetaBoxes: new Map(),
    userMetaBoxes: new Map(),
    capabilities: new Map(),
    settingsGroups: new Map(),
    settingsPages: new Map(),
    rewriteRules: [],
    redirects: [],
    archiveTypes: new Map(),
    views: new Map(),
    rpcRouters: new Map(),
    mcpTools: new Map(),
    rawRoutes: [],
    publicRoutes: [],
    restResources: [],
    loginLinks: [],
    adminPages: new Map(),
    dashboardWidgets: new Map(),
    fieldTypes: new Map(),
    blockSpecs: new Map(),
    markSpecs: new Map(),
    patternSpecs: new Map(),
    shortcodeSpecs: new Map(),
    lookupAdapters: new Map(),
    scheduledTasks: [],
    templateDeps: new Map(),
    // Read by several independent plugins, so no plugin can own them.
    imageRoles: new Map([
      ["featured", { name: "featured", single: true, registeredBy: null }],
      ["ogImage", { name: "ogImage", single: false, registeredBy: null }],
    ]),
    frameworkRoutes,
  };
}

/**
 * Public, non-hierarchical types: what the front page, author and date archives
 * list, so also the tags they are stored under.
 */
export function listedEntryTypeNames(
  registry: PluginRegistry,
): readonly string[] {
  return [...registry.entryTypes.values()]
    .filter((type) => type.isPublic && type.isHierarchical !== true)
    .map((type) => type.name);
}

/**
 * A taxonomy listing no entry types depends on every public type, since its
 * term feed lists any attached public entry.
 */
export function termPageEntryTypeNames(
  registry: PluginRegistry,
  taxonomy: string,
): readonly string[] {
  const listed = registry.termTaxonomies.get(taxonomy)?.entryTypes ?? [];
  if (listed.length > 0) return listed;
  return publicEntryTypeNames(registry);
}

export function publicEntryTypeNames(
  registry: PluginRegistry,
): readonly string[] {
  return [...registry.entryTypes.values()]
    .filter((type) => type.isPublic)
    .map((type) => type.name);
}

export function findEntryMetaField(
  registry: PluginRegistry,
  entryType: string,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.entryMetaBoxes.values()) {
    if (!box.entryTypes.includes(entryType)) continue;
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

export function listEntryMetaFields(
  registry: PluginRegistry,
  entryType: string,
): readonly MetaBoxField[] {
  const fields: MetaBoxField[] = [];
  for (const box of registry.entryMetaBoxes.values()) {
    if (!box.entryTypes.includes(entryType)) continue;
    fields.push(...box.fields);
  }
  return fields;
}

export function findTermMetaField(
  registry: PluginRegistry,
  termTaxonomy: string,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.termMetaBoxes.values()) {
    if (!box.termTaxonomies.includes(termTaxonomy)) continue;
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}

export function listTermMetaFields(
  registry: PluginRegistry,
  termTaxonomy: string,
): readonly MetaBoxField[] {
  const fields: MetaBoxField[] = [];
  for (const box of registry.termMetaBoxes.values()) {
    if (!box.termTaxonomies.includes(termTaxonomy)) continue;
    fields.push(...box.fields);
  }
  return fields;
}

/** Users share one flat keyspace, so there is no scope to pass. */
export function listUserMetaFields(
  registry: PluginRegistry,
): readonly MetaBoxField[] {
  const fields: MetaBoxField[] = [];
  for (const box of registry.userMetaBoxes.values()) {
    fields.push(...box.fields);
  }
  return fields;
}

export function findUserMetaField(
  registry: PluginRegistry,
  key: string,
): MetaBoxField | undefined {
  for (const box of registry.userMetaBoxes.values()) {
    const field = box.fields.find((f) => f.key === key);
    if (field) return field;
  }
  return undefined;
}
