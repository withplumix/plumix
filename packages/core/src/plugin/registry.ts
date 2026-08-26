// Plugin registry container — the runtime half of the plugin system. Holds
// every `Registered*` shape, the registration `*Options` inputs they extend,
// the visibility resolvers, the `PluginRegistry` map bag + `createPluginRegistry`,
// and the meta-field lookup helpers. This is what the runtime importers
// traverse; the build-time `manifest-projection.ts` reads a snapshot of it.
// Re-exported unchanged from the public `@plumix/core/manifest` barrel.

import type { AnyRouter } from "@orpc/server";
import type { SQL } from "drizzle-orm";

import type {
  BlockPattern,
  BlockSpec,
  MarkSpec,
  ShortcodeSpec,
} from "@plumix/blocks";

import type { AccessPolicy } from "../access/policy.js";
import type {
  EntryTypeCapabilityOverrides,
  TermTaxonomyCapabilityOverrides,
} from "../auth/rbac.js";
import type { AppContext } from "../context/app.js";
import type { UserRole } from "../db/schema/users.js";
import type { Label } from "../i18n/label.js";
import type { McpTool } from "../mcp/tool.js";
import type { RouteIntent } from "../route/intent.js";
import type { RedirectRule } from "../route/redirects.js";
import type { CustomArchiveData } from "../route/render/resolved-entry.js";
import type { SitemapUrl } from "../seo/sitemap.js";
import type { RegisteredTemplateDep } from "../template-deps.js";
import type {
  MetaBoxField,
  MetaBoxFieldInput,
} from "./fields/meta-box-field.js";
import type { RegisteredLookupAdapter } from "./lookup.js";

/**
 * WP-style per-type chrome labels shared between `EntryTypeOptions.labels`
 * and `EntryTypeManifestEntry.labels`. Every field is optional on the
 * options side; `buildManifest` resolves the cascade server-side so the
 * projection (`ResolvedEntryTypeLabels`) ships every key fully populated.
 * Consumers read `entry.labels.editItem` directly — no per-call-site
 * fallback boilerplate.
 *
 * Key set mirrors WP's `register_post_type()` labels table where the
 * mental model carries (`searchItems`, `notFound`, `addNewItem`, etc.)
 * plus plumix-specific SPA chrome (`loadingItems`, `loadErrorItems`,
 * `untitledItem`, `noMatch`) that PHP-WP doesn't need. Deliberately
 * excludes `menu_name` (already covered by `label`/`plural`),
 * `name_admin_bar` (plumix has no admin bar), media-specific keys
 * (`featured_image`, `insert_into_item`, …) that belong on the media
 * plugin, and tag-cloud affordances (`popular_items`, `most_used`)
 * that plumix's picker UX doesn't surface.
 */
export interface EntryTypeLabels {
  // Identity
  readonly singular?: Label;
  readonly plural?: Label;
  // Create / read / update / delete actions
  /** "Add New" — short-form CTA for the admin bar quick-create overflow. */
  readonly addNew?: Label;
  /** "Add Post" — primary create CTA on list pages and slash menu. */
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
  // Status-change toasts (mirror WP's `item_*` family from 5.0+)
  /** "Post updated" — toast after autosave or explicit save. */
  readonly itemUpdated?: Label;
  /** "Post published" — toast after first publish. */
  readonly itemPublished?: Label;
  /** "Post published privately" — toast for private visibility. */
  readonly itemPublishedPrivately?: Label;
  /** "Post scheduled" — toast after scheduling a future publish. */
  readonly itemScheduled?: Label;
  /** "Post moved to trash" — toast after trash action completes. */
  readonly itemTrashed?: Label;
  /** "Post reverted to draft" — toast after unpublish. */
  readonly itemRevertedToDraft?: Label;
  // Accessibility region labels (SR-only)
  /** "Posts list" — SR-only region label for the data table. */
  readonly itemsList?: Label;
  /** "Posts list navigation" — SR-only region label for pagination. */
  readonly itemsListNavigation?: Label;
  /** "Filter posts list" — SR-only label for the filter row. */
  readonly filterItemsList?: Label;
}

export interface EntryTypeOptions {
  readonly label: Label;
  /**
   * Human-readable label variants. `plural` also drives the admin URL slug
   * (`/entries/<slugified-plural>`) unless overridden; omit it and the slug
   * falls back to `${name}s`, which is acceptable for English-named types
   * but surfaces an "anglos" for `name: "angle"` etc. — plugins with
   * irregular plurals should set `labels.plural` explicitly.
   *
   * The other keys mirror WordPress's `register_post_type()` labels table:
   * per-type chrome strings the admin would otherwise produce by
   * lowercase-noun substitution. Substitution breaks in languages with
   * gender/case agreement (DE, RU, PL, UK, AR), and lowercasing translated
   * nouns is wrong in DE (Beiträge → beiträge is a typo). Each label is
   * optional and the admin falls back to a generic noun-less catalog
   * string when missing.
   */
  readonly labels?: EntryTypeLabels;
  readonly description?: string;
  readonly supports?: readonly string[];
  readonly termTaxonomies?: readonly string[];
  readonly isHierarchical?: boolean;
  /** Master visibility switch; defaults to `true`. Cascades to `showUI`/`showInSidebar`/`excludeFromGenericRpc`/`excludeFromSearch` when those are unset. */
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly excludeFromGenericRpc?: boolean;
  readonly excludeFromSearch?: boolean;
  readonly hasArchive?: boolean | string;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
  readonly capabilityType?: string;
  readonly capabilities?: EntryTypeCapabilityOverrides;
  readonly priority?: number;
  readonly menuIcon?: string;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
  /**
   * Per-type versioning policy. Only honored when `supports` includes
   * `"revisions"`. `maxRevisions` caps how many revision rows are
   * retained per live entry (default 25); `autosaveIntervalSeconds`
   * shapes the editor's autosave cadence (default 60).
   */
  readonly versioning?: {
    readonly maxRevisions?: number;
    readonly autosaveIntervalSeconds?: number;
  };
  /** Page size for this type's archive route. Default 20. */
  readonly archivePerPage?: number;
  /**
   * Access-control policy space for entries of this type. `default` gates
   * every entry's own routes (its `single` and `archive` intents); `policies`
   * is the closed set an editor may later assign per-entry. Absent ⇒ the global
   * `anonymous` default (un-policied — cached and rendered exactly as today).
   *
   * Scope boundary (this slice): the policy gates only the entry's *own* single
   * and archive routes. It does NOT yet filter the entry out of aggregate
   * surfaces it also appears on — the front page, taxonomy / author / date
   * archives, search, RSS/Atom feeds, or the sitemap. So a gated entry's title
   * / excerpt (and, via a feed, its body) can still surface anonymously there.
   * That is intentional for the soft-paywall case (a teaser must stay indexable)
   * and the teaser-vs-exclude decision needs the segment / soft-gate model — so
   * cross-surface filtering lands with segment-keyed caching + the soft gate
   * (follow-up slices). Do not rely on `access` alone to make a type fully
   * private across every surface until then.
   */
  readonly access?: EntryTypeAccess;
}

export interface EntryTypeAccess {
  /**
   * Applied to every entry of this type until a per-entry choice overrides it
   * with one of {@link policies} (see {@link ACCESS_POLICY_META_KEY}). Also the
   * fallback when an entry's stored choice names a key no longer in the space.
   */
  readonly default: AccessPolicy;
  /**
   * The closed set of policies an editor may assign per-entry. `default` is
   * always implicitly part of the space (selecting nothing ⇒ `default`); list
   * the additional selectable policies here. Absent ⇒ `default` is the only
   * option and no per-entry override is possible.
   */
  readonly policies?: readonly SelectableAccessPolicy[];
}

/**
 * A developer-declared, editor-selectable access policy for an entry type.
 * `key` is the stable identifier persisted on the entry (under
 * {@link ACCESS_POLICY_META_KEY}); `label` names the option in the editor's
 * visibility picker; `policy` is the gate applied when an entry selects `key`.
 * The resolver stays server-side — only {@link AccessPolicyChoice} (`key` +
 * `label`) is projected to the admin manifest.
 */
export interface SelectableAccessPolicy {
  readonly key: string;
  readonly label: Label;
  readonly policy: AccessPolicy;
}

/**
 * WP-style per-type chrome labels for term taxonomies. Same cascade
 * semantics as `EntryTypeLabels` — `buildManifest` resolves into
 * `ResolvedTermTaxonomyLabels` server-side. Terms always have a
 * server-supplied `name` so `untitledItem` doesn't apply here.
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
  readonly description?: string;
  readonly isHierarchical?: boolean;
  readonly entryTypes?: readonly string[];
  readonly isPublic?: boolean;
  readonly showUI?: boolean;
  readonly showInSidebar?: boolean;
  readonly excludeFromGenericRpc?: boolean;
  readonly isInQuickEdit?: boolean;
  readonly hasAdminColumn?: boolean;
  readonly rewrite?: {
    readonly slug?: string;
    readonly isHierarchical?: boolean;
  };
  readonly capabilities?: TermTaxonomyCapabilityOverrides;
  readonly menuIcon?: string;
  /** Synonyms the command palette matches in addition to the sidebar label. */
  readonly keywords?: readonly Label[];
  /** Page size for this taxonomy's term archives. Default 20. */
  readonly archivePerPage?: number;
}

export function resolveEntryTypeVisibility(options: EntryTypeOptions): {
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly excludeFromGenericRpc: boolean;
  readonly excludeFromSearch: boolean;
} {
  const isPublic = options.isPublic ?? true;
  const showUI = options.showUI ?? isPublic;
  return {
    isPublic,
    showUI,
    showInSidebar: options.showInSidebar ?? showUI,
    excludeFromGenericRpc: options.excludeFromGenericRpc ?? !isPublic,
    excludeFromSearch: options.excludeFromSearch ?? !isPublic,
  };
}

export function resolveTermTaxonomyVisibility(options: TermTaxonomyOptions): {
  readonly isPublic: boolean;
  readonly showUI: boolean;
  readonly showInSidebar: boolean;
  readonly excludeFromGenericRpc: boolean;
} {
  const isPublic = options.isPublic ?? true;
  const showUI = options.showUI ?? isPublic;
  return {
    isPublic,
    showUI,
    showInSidebar: options.showInSidebar ?? showUI,
    excludeFromGenericRpc: options.excludeFromGenericRpc ?? !isPublic,
  };
}

/**
 * Shared base for every "card of fields" registration surface — entry
 * meta boxes, term meta boxes, user meta boxes, and settings groups.
 * Each concrete surface extends this with its scope specifier (if any)
 * and any surface-specific layout hints (`location` on entry boxes).
 *
 * Semantics shared across every extender:
 * - `priority` orders cards within their region; lower first,
 *   unspecified sorts last, ties break by `id` / `name` alphabetical.
 * - `capability` is a UI-only filter — the admin hides cards the
 *   viewer lacks the capability for. The server enforces only the
 *   entity-level write gate (`<entryType>:edit*`, `<termTaxonomy>:edit`,
 *   `user:edit`, `settings:manage`). Do NOT use `capability` for
 *   secrets; any user with the entity write gate can write any
 *   registered field via the raw RPC.
 * - `fields` carry `MetaBoxField.sanitize` which runs server-side only
 *   — the manifest wire contract strips callbacks before shipping.
 */
export interface MetaBoxBaseOptions {
  readonly label: Label;
  readonly description?: Label;
  readonly priority?: number;
  readonly capability?: string;
  readonly fields: readonly MetaBoxFieldInput[];
}

/**
 * Meta box shown on the entry editor. Scoped by `entryTypes`. Renders
 * as a collapsible section in the editor's document rail, which is
 * fixed at 256px — fields always occupy the full row. `span` is
 * accepted like on every other surface but ignored at render (a
 * universal hint narrow surfaces don't honor), and stripped from the
 * entry wire projection.
 */
export interface EntryMetaBoxOptions extends MetaBoxBaseOptions {
  /**
   * @deprecated The entry editor no longer partitions meta boxes by
   * location — every registered box renders as a collapsible section in
   * the right rail regardless of this flag. Declared for backward
   * compatibility with plugins that still set it; safe to remove from
   * new code.
   */
  readonly location?: "bottom" | "sidebar";
  readonly entryTypes: readonly string[];
}

/** Meta box shown on the termTaxonomy term edit form. Scoped by `termTaxonomies`. */
export interface TermMetaBoxOptions extends MetaBoxBaseOptions {
  readonly termTaxonomies: readonly string[];
}

/**
 * Meta box shown on the user edit form. User meta is a flat keyspace
 * (no scope analogue to entry types or termTaxonomies), so the base shape
 * is everything an author needs.
 */
export type UserMetaBoxOptions = MetaBoxBaseOptions;

/**
 * A self-contained group of fields on a settings page — storage unit
 * AND visual unit. Each group gets its own Save button (independent
 * storage, unlike entity meta which rides the entity's single Save).
 * Surfaced via `registerSettingsPage.groups: string[]`.
 */
export type SettingsGroupOptions = MetaBoxBaseOptions;

/**
 * A UI-level composition of groups rendered at `/settings/<page>` in the
 * admin. Pages are not stored — they're pure registration metadata. A
 * page lists the groups it wants to surface by name (each group can be
 * referenced from multiple pages if useful).
 */
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
}

export interface RegisteredTermTaxonomy extends TermTaxonomyOptions {
  readonly name: string;
  readonly registeredBy: string | null;
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
   * Additional roles explicitly granted the capability, independent of
   * hierarchy. Complements `minRole`: a role satisfies the capability
   * if it meets `minRole` OR appears here. Useful for non-contiguous
   * grants ("editors and authors but not admins in between" stays
   * impossible; "admin by hierarchy + author explicitly" becomes
   * expressible). Sorted + deduped at registration.
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

/** The render payload a custom-archive resolver produces, or `null` for a 404. */
export interface CustomArchiveResolution {
  readonly data: CustomArchiveData;
  readonly title: string;
  /**
   * Edge-cache tags for the content this archive lists — typically `t:<type>`
   * for each entry type it draws from (see {@link typeTag}). When the archive
   * is `cacheable`, a publish of any listed type purges the stored page, the
   * same coarse invalidation the built-in archives get. Ignored when the
   * archive hasn't opted into caching.
   */
  readonly tags?: readonly string[];
}

/** The RSS/Atom feed a `registerArchiveType` archive can own. */
export interface ArchiveTypeFeed {
  /** URLPattern pathnames the feed answers (e.g. `/events/:series/feed`). */
  readonly routes: readonly string[];
  /** SQL row filter for the feed's entries, or `null` → 404. */
  readonly filter: (
    ctx: AppContext,
    params: Record<string, string>,
  ) => Promise<SQL | null> | SQL | null;
}

/**
 * The sitemap URL space a `registerArchiveType` archive can own. The cached
 * output is retired by the same `entry:*` / `term:*` actions that bust the rest
 * of the sitemap; an archive drawn from other tables should keep those actions
 * as its own invalidation signal.
 */
export interface ArchiveTypeSitemap {
  /** Published URL count — drives index pagination without a full URL scan. */
  readonly count: (ctx: AppContext) => Promise<number> | number;
  /** URLs for one 1-based page, windowed to `SITEMAP_PAGE_SIZE` as core expects. */
  readonly urls: (
    ctx: AppContext,
    page: number,
  ) => Promise<readonly SitemapUrl[]> | readonly SitemapUrl[];
}

/**
 * `registerArchiveType` options — a URL pattern set + resolver (+ optional feed
 * and sitemap) that adds a whole archive type without patching core. The
 * resolver returns the render payload (`{ data, title }`) or `null` (404);
 * `data` extends {@link CustomArchiveData} and is typed via `ArchiveTypeRegistry`.
 */
export interface ArchiveTypeOptions {
  /** URLPattern pathnames that dispatch to this archive (`/events/:series`). */
  readonly routes: readonly string[];
  /** Route priority (lower wins); defaults to the rewrite-rule priority. */
  readonly priority?: number;
  /**
   * Opt this archive's anonymous GET renders into the built-in edge cache.
   * Off by default: core can't know a custom archive's content dependencies,
   * so caching without a tag contribution would risk stale pages. Pair with a
   * `tags` contribution from {@link CustomArchiveResolution.tags} so a publish
   * of the listed types purges the archive the way built-in archives are.
   */
  readonly cacheable?: boolean;
  readonly resolve: (
    ctx: AppContext,
    params: Record<string, string>,
  ) => Promise<CustomArchiveResolution | null> | CustomArchiveResolution | null;
  readonly feed?: ArchiveTypeFeed;
  /** Fold this archive into the native sitemap index (`/sitemap-<name>-<page>.xml`); absent otherwise. */
  readonly sitemap?: ArchiveTypeSitemap;
  /**
   * Access-control policy gating this custom (route-level) archive. Absent ⇒
   * the global `anonymous` default. A policied archive renders live (it opts
   * out of the edge cache in this slice, like any other policied route).
   */
  readonly access?: AccessPolicy;
}

export interface RegisteredArchiveType extends ArchiveTypeOptions {
  readonly name: string;
  readonly registeredBy: string | null;
}

/**
 * Reference to a React component contributed by a plugin. The string is
 * the export name on the plugin's `adminEntry` module — the plumix vite
 * pipeline namespace-imports each plugin's entry and emits the matching
 * `window.plumix.registerPlugin{Page,FieldType}` calls into the
 * synthesised admin chunk, so plugin authors only need `export const
 * MyComponent = ...` and a single registration call to `ctx.register*`.
 *
 * No `package` field is needed: the plugin id (implicit from
 * registration context) keys the namespace import the export resolves
 * against. Drop-in for the previous `{ package, export }` shape; bumped
 * pre-release so consumers can update in one pass.
 */
export type PluginComponentRef = string;

/**
 * How an admin page slots into the sidebar. `group` is either a bare
 * id (string) or an object that declares group metadata inline — first
 * page using a given id sets the label/priority for that group; later
 * pages can use the bare-string form to attach to it. Core group ids
 * (`overview` / `content` / `term-taxonomies` / `management`) carry
 * their own label/priority and ignore inline metadata.
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
  readonly capability?: string;
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
  readonly capability?: string;
  /** Export name in the plugin's admin chunk, resolved at render. */
  readonly component: PluginComponentRef;
  /** Lower sorts first on the dashboard; unset sorts last. */
  readonly priority?: number;
}

export interface RegisteredDashboardWidget extends DashboardWidgetOptions {
  readonly registeredBy: string | null;
}

/**
 * Plugin-contributed form field renderer. The admin's form dispatcher
 * falls through to a plain text input on unknown `inputType` values
 * (with a dev-mode warning); registering a type here swaps in a
 * plugin React component that renders the custom UI.
 *
 * The `type` string must match a field's `inputType` — registering
 * `type: "media_picker"` means any field (entry meta, term meta,
 * user meta, settings group) with `inputType: "media_picker"`
 * renders through the plugin's component.
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

export type PluginRouteAuth =
  "public" | "authenticated" | { readonly capability: string };

export interface RegisteredRawRoute {
  readonly pluginId: string;
  readonly method: PluginRouteMethod;
  readonly path: string;
  readonly auth: PluginRouteAuth;
  /**
   * Whether the route opted into the edge cache — see `registerRoute`, which
   * documents what taking it claims and rejects it on a gated route.
   */
  readonly cacheable?: boolean;
  readonly handler: (
    request: Request,
    ctx: AppContext,
  ) => Response | Promise<Response>;
}

export type RestResourceMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * A REST resource a plugin contributes into the shared `/_plumix/api/v1/`
 * namespace. `path` is relative to that prefix (e.g. `/{type}/{id}/comments`)
 * and uses `{param}` segments. `auth` reuses the declarative route model; core
 * enforces it before the handler runs. `input`/`output` are valibot schemas —
 * the `output` schema is the public allowlist and feeds the generated spec.
 */
export interface RestResourceOptions {
  readonly method?: RestResourceMethod;
  readonly path: string;
  readonly auth: PluginRouteAuth;
  /* eslint-disable @typescript-eslint/no-explicit-any -- one registry slot holds every plugin's heterogeneous valibot schemas */
  readonly input?: any;
  readonly output: any;
  readonly handler: (args: { input: any; context: AppContext }) => any;
  /* eslint-enable @typescript-eslint/no-explicit-any */
}

export interface RegisteredRestResource extends RestResourceOptions {
  readonly pluginId: string;
  readonly method: RestResourceMethod;
}

/**
 * Tiny `{ key, label, href }` blob a plugin attaches so the standard
 * login screen can render a button for the sign-in flow it ships. The
 * actual flow (start route, callback route, identity resolution) is
 * registered separately via `registerRoute` + `resolveExternalIdentity`;
 * this is purely the UI affordance that points the user at it.
 */
export interface LoginLinkOptions {
  /**
   * Stable key, scoped per-plugin. The wire id surfaced to the admin
   * (and used as its React key) is `${pluginId}:${key}`, so the bare
   * `key` you pass only needs to be unique within your own plugin —
   * two different plugins can both register a `key: "default"`.
   *
   * Lowercase alphanum + dash/underscore, must start with a letter,
   * 1–32 chars total. Same shape as `OAUTH_PROVIDER_KEY_PATTERN`.
   */
  readonly key: string;
  /**
   * Button text shown on the login screen ("Sign in with Microsoft",
   * "Continue with Okta"). No CR/LF — see `siteName` for rationale.
   */
  readonly label: string;
  /**
   * URL the button points at — typically the plugin's own start route,
   * e.g. `/_plumix/saml-microsoft/start`. Must be a relative path
   * starting with `/` or an `https://` absolute URL; arbitrary schemes
   * are rejected so a malicious or misconfigured plugin can't surface
   * a `javascript:` link.
   */
  readonly href: string;
}

export interface RegisteredLoginLink extends LoginLinkOptions {
  readonly registeredBy: string;
}

/**
 * Plugin-registered work that fires on the runtime's scheduled trigger
 * (Cloudflare cron, future Node/Bun timers). The handler receives a
 * synthetic-request `AppContext` — same `db` / `hooks` / `logger` /
 * `defer` as a normal request, but `user` is `null` and `request` is
 * an internal marker.
 *
 * A task with a `cron` runs only on the invocation whose fired schedule
 * (`event.cron`) byte-matches it; a task without one runs on every
 * invocation. The operator must declare a matching `wrangler` `triggers.crons`
 * entry for a `cron`-tagged task to ever fire — the strings must be identical.
 */
export interface ScheduledTask {
  readonly id: string;
  /** Cron expression; must byte-match a `wrangler` `triggers.crons` entry. */
  readonly cron?: string;
  readonly handler: (ctx: AppContext) => void | Promise<void>;
}

export interface RegisteredScheduledTask extends ScheduledTask {
  readonly registeredBy: string;
}

/**
 * The shape `registerRpcRouter` accepts: procedures keyed by the name each is
 * called under, nested to any depth (`menu.locations.list` is a `locations`
 * router holding a `list`). Core's own name for oRPC's `AnyRouter`, so a plugin
 * can say what its router-building function returns without taking a direct
 * dependency on `@orpc/server`.
 *
 * Name a router's shape with a `type` and not an `interface` — TypeScript
 * withholds the implicit index signature from interface declarations, so an
 * interface never assigns here. `json.ts` carries the same caveat.
 */
export type PluginRpcRouter = AnyRouter;

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
  readonly rpcRouters: ReadonlyMap<string, PluginRpcRouter>;
  readonly mcpTools: ReadonlyMap<string, RegisteredMcpTool>;
  readonly rawRoutes: readonly RegisteredRawRoute[];
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
  readonly rpcRouters: Map<string, PluginRpcRouter>;
  readonly mcpTools: Map<string, RegisteredMcpTool>;
  readonly rawRoutes: RegisteredRawRoute[];
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
}

export function createPluginRegistry(): MutablePluginRegistry {
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
    rpcRouters: new Map(),
    mcpTools: new Map(),
    rawRoutes: [],
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
  };
}

/**
 * Look up the `MetaBoxField` declaration for a meta key within the
 * entry meta surface, scoped to a given entry type. Returns the first
 * matching field across all registered entry meta boxes — key
 * uniqueness per (entryType, key) is enforced at registration time,
 * so "first match" is the only match.
 */
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

/**
 * Every `MetaBoxField` registered for an entry type, across all its meta
 * boxes. Used by the publish gate to validate a promoted bag against the
 * full schema — so a required field ABSENT from the bag is caught, not
 * just one stored empty. Key uniqueness per (entryType, key) holds at
 * registration, so no de-duplication is needed.
 */
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

/**
 * Like `findEntryMetaField`, but for term meta. Scoped by termTaxonomy.
 */
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

/**
 * Like `findEntryMetaField`, but for user meta. Users have a flat
 * keyspace (no entry-type / termTaxonomy analogue), so no scope argument —
 * key uniqueness across all user meta boxes is enforced at manifest-
 * build time.
 */
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
