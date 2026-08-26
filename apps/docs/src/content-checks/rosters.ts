// The roster-drift guard: what binds a roster page to the source it promises
// to enumerate.
//
// A roster page says *this is all of them*. When it falls behind its source it
// does not merely become incomplete — it lies, because a reader treats an
// omission as evidence the thing does not exist.
//
// Each roster below holds its item ids **once**, and two assertions pin that
// list from both sides:
//
//   1. To the source. Either a type-level binding here, or a runtime
//      comparison in `rosters.test.ts` — see "which binding" below.
//   2. To the page, by `checkRosterDrift`, which reads the page's `###`
//      headings and reports either direction of disagreement. The page's own
//      body: an item contributed by an imported partial reads as missing,
//      because a promise assembled out of fragments cannot be read against a
//      source.
//
// Transitively that is page ≡ source, with no code generation and no change to
// the product.
//
// **Which binding.** Follow the source's shape:
//
// - **Type-level** when the source's declared type carries its values — an
//   `as const` array, a string union, an interface whose keys are the roster,
//   a `declare module` registry. Most rosters here are this kind, and for the
//   registries and interfaces it is the only binding there could be: they have
//   no runtime form to compare against. Note that `tsc` resolves `plumix` to
//   its built `.d.ts`, so this half reads source only after a build — in a
//   working tree with stale `dist` it is the runtime half that is current.
// - **Runtime** when the source's own annotation widens its values away
//   (`readonly BlockSpec[]`, `Record<string, …>`) or the source is data rather
//   than types (a `package.json` `exports` map): `typeof` has nothing left to
//   compare, and the runtime comparison is stricter anyway, pinning order as
//   well as membership. Those live in `rosters.test.ts`.
//
// Read every source through the `plumix` façade. That is the surface the
// documentation describes, so a roster bound to anything else could agree with
// the repo while disagreeing with what a reader can actually import.
//
// **The item id is the `###` heading's text**, exactly as the source spells the
// item — for a heading carrying a signature, the signature as written. Two
// things settle this. MDX cannot express the `{#id}` suffix the IA spec asks
// for: braces open an expression, and `{#id}` is not one, so the page fails to
// parse. And the heading's text is what generates its anchor, so pinning the
// text pins the anchor a reader or an agent cites. Text rather than that
// slugified anchor is what the guard compares, because the slug is lossy —
// `userList` and `userlist` share an anchor, but only one is the name the
// source uses.
//
// Where the source spells a name with a parameter, the page spells that
// parameter `*` and the binding substitutes it back — the convention the
// capability roster already set with `entry:*:read`. The per-entry-type hooks
// need it because their source spelling is `entry:${string}:published`, which
// no heading can carry; the cache tags need it because MDX reads a bare
// `t:<type>` as an unclosed JSX tag and refuses to parse the page at all.
//
// **Two rosters are page-bound only**, and deliberately: `apis/mcp.mdx` and
// `deployment/cli.mdx`. Each says at its own list which source it would bind
// to and why it may not. They carry `binding: "page-only"`, so how many are
// unbound is a fact `rosters.test.ts` checks rather than a paragraph someone
// has to keep true.
//
// **What these unions see is what `apps/docs` depends on.** `FilterName`,
// `ActionName` and `keyof EntryTypeOptions` are not "what core declares" —
// they are what this TypeScript program can reach, and every plugin augments
// them through `declare module "plumix"` (`@plumix/plugin-menu` alone adds
// three hooks and two entry-type options). They resolve to core's own set only
// because this app depends on `plumix` and nothing else. Adding a
// `@plumix/plugin-*` package to it folds that plugin's augmentations into
// these unions and breaks three assertions at once — the fix then is the
// dependency, not the roster.
//
// **Adding a roster:** append an entry to `ROSTERS`, hold its items in source
// order, bind it, name that binding in the entry, and raise the count in
// `rosters.test.ts`. Nothing else re-decides. Two cases you may meet:
//
// - **A page item its source does not carry.** The guard reports it, which is
//   the point: extend the list and say in a comment which source the extra
//   item answers to. Silence would make the roster's promise unenforceable.
// - **A list that is not a roster.** `supports` is the standing example: the
//   code accepts any string, so no complete set exists to promise and its page
//   presents a conventional list instead. Do not add it here — a guard would
//   assert a closed set the product does not have, and the first plugin to
//   pass its own `supports` value would be reported as drift.

import type {
  ActionName,
  ArchiveData,
  AuthorArchiveData,
  CustomArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeLabels,
  EntryTypeOptions,
  ErrorData,
  FilterName,
  FrontPageData,
  GenericTier,
  PlumixConfigInput,
  SearchData,
  TargetMatcher,
  TaxonomyData,
  TemplateData,
} from "plumix";
import type * as PlumixFacade from "plumix";
import type { PlumixPrefetch, PlumixStrategy } from "plumix/blocks";
import type { CANONICAL_INPUT_TYPES } from "plumix/fields";
import type { EntryStatus, UserRole } from "plumix/schema";

import type { Roster } from "./roster-drift";
import type { Assert, Equals } from "./type-assert";

// --- Getting Started -------------------------------------------------------

/**
 * Every subpath the façade publishes, in `package.json` order. Source: the
 * `exports` map of `packages/plumix/package.json`, compared at runtime — an
 * exports map is data, and nothing about its keys survives into a type.
 */
const FACADE_SUBPATHS = [
  "plumix",
  "plumix/plugin",
  "plumix/theme",
  "plumix/vite",
  "plumix/admin",
  "plumix/admin/react",
  "plumix/admin/react-jsx-runtime",
  "plumix/admin/react-dom",
  "plumix/admin/react-dom-client",
  "plumix/admin/react-query",
  "plumix/admin/react-router",
  "plumix/admin/orpc-client",
  "plumix/admin/orpc-client-fetch",
  "plumix/admin/orpc-tanstack-query",
  "plumix/admin/lingui-core",
  "plumix/admin/lingui-react",
  "plumix/admin/radix",
  "plumix/admin/sonner",
  "plumix/admin/tailwind-merge",
  "plumix/admin/ui",
  "plumix/test/playwright",
  "plumix/blocks",
  "plumix/blocks/renderer",
  "plumix/blocks/test",
  "plumix/blocks/island-runtime",
  "plumix/blocks/island-renderer",
  "plumix/core/dev-client",
  "plumix/schema",
  "plumix/db",
  "plumix/db/libsql",
  "plumix/fields",
  "plumix/i18n",
  "plumix/test",
  "plumix/editor-runtime",
] as const;

/**
 * Every slot `plumix.config.ts` accepts, in declaration order. Source:
 * `PlumixConfigInput`.
 *
 * `PlumixConfig` — the resolved shape `buildApp` produces — is deliberately
 * not the source: it carries defaults the author never writes, and the page
 * documents what an author types.
 */
const CONFIG_OPTIONS = [
  "runtime",
  "database",
  "auth",
  "storage",
  "imageDelivery",
  "kv",
  "cache",
  "mailer",
  "theme",
  "plugins",
  "i18n",
  "redirects",
  "basePath",
  "mcp",
  "api",
  "debugBar",
  "telemetry",
  "blocks",
  "images",
  "vite",
] as const;

type _ConfigOptionsMatchSource = Assert<
  Equals<(typeof CONFIG_OPTIONS)[number], keyof PlumixConfigInput>
>;

// --- Content Modelling -----------------------------------------------------

/** The statuses an entry moves between. Source: `ENTRY_STATUSES`. */
const STATUSES = ["draft", "published", "scheduled", "trash"] as const;

type _StatusesMatchSource = Assert<
  Equals<(typeof STATUSES)[number], EntryStatus>
>;

/**
 * Every option `registerEntryType` accepts, in declaration order. Source:
 * `EntryTypeOptions`.
 */
const ENTRY_TYPE_OPTIONS = [
  "label",
  "labels",
  "description",
  "supports",
  "termTaxonomies",
  "isHierarchical",
  "isPublic",
  "showUI",
  "showInSidebar",
  "excludeFromGenericRpc",
  "excludeFromSearch",
  "hasArchive",
  "rewrite",
  "capabilityType",
  "capabilities",
  "priority",
  "menuIcon",
  "keywords",
  "versioning",
  "archivePerPage",
  "access",
] as const;

type _EntryTypeOptionsMatchSource = Assert<
  Equals<(typeof ENTRY_TYPE_OPTIONS)[number], keyof EntryTypeOptions>
>;

/**
 * Every per-type chrome string, in declaration order. Source:
 * `EntryTypeLabels`.
 */
const ENTRY_TYPE_LABELS = [
  "singular",
  "plural",
  "addNew",
  "addNewItem",
  "editItem",
  "newItem",
  "viewItem",
  "viewItems",
  "searchItems",
  "notFound",
  "notFoundInTrash",
  "loadingItems",
  "loadErrorItems",
  "allItems",
  "noMatch",
  "parentItem",
  "parentItemColon",
  "untitledItem",
  "moveToTrash",
  "itemUpdated",
  "itemPublished",
  "itemPublishedPrivately",
  "itemScheduled",
  "itemTrashed",
  "itemRevertedToDraft",
  "itemsList",
  "itemsListNavigation",
  "filterItemsList",
] as const;

type _EntryTypeLabelsMatchSource = Assert<
  Equals<(typeof ENTRY_TYPE_LABELS)[number], keyof EntryTypeLabels>
>;

/**
 * The entry-type reference hosts both rosters, so they merge into one list —
 * `checkRosterDrift` reads every `###` heading on a page, and two entries
 * claiming one page would each report the other's items as unknown. Labels
 * carry their `labels.` path so `notFound` the option and `notFound` the label
 * stay distinguishable, and so each heading's anchor is unique.
 */
const ENTRY_TYPE_REFERENCE: readonly string[] = [
  ...ENTRY_TYPE_OPTIONS,
  ...ENTRY_TYPE_LABELS.map((label) => `labels.${label}`),
];

// --- Fields ----------------------------------------------------------------

/**
 * Every field type authorable out of the box, in family order. Source:
 * `CANONICAL_INPUT_TYPES`. The three legacy types are deliberately absent —
 * they are retired, and the IA spec leaves them undocumented — as are the
 * plugin-contributed `media` kinds, which `@plumix/plugin-media` ships rather
 * than core.
 */
const FIELD_TYPES = [
  "text",
  "textarea",
  "email",
  "url",
  "password",
  "date",
  "datetime",
  "time",
  "number",
  "color",
  "range",
  "json",
  "user",
  "userList",
  "entry",
  "entryList",
  "term",
  "termList",
  "select",
  "toggle",
  "richtext",
  "repeater",
  "group",
  "link",
] as const;

type _FieldTypesMatchSource = Assert<
  Equals<(typeof FIELD_TYPES)[number], (typeof CANONICAL_INPUT_TYPES)[number]>
>;

// --- Blocks ----------------------------------------------------------------

/**
 * Every block core registers, in registration order. Source: `coreBlocks`,
 * whose `readonly BlockSpec[]` annotation puts the names out of reach of a
 * type-level binding.
 */
const CORE_BLOCKS = [
  "core/rich-text",
  "core/separator",
  "core/code",
  "core/group",
  "core/section",
  "core/columns",
  "core/column",
  "core/button",
  "core/details",
  "core/video",
  "core/embed",
  "core/html",
  "core/table",
  "core/table-header-row",
  "core/table-body-row",
  "core/table-header-cell",
  "core/table-cell",
  "core/pattern-ref",
] as const;

/** Every inline mark, in bubble-menu order. Source: `coreMarks`. */
const CORE_MARKS = [
  "bold",
  "italic",
  "strike",
  "code",
  "link",
  "underline",
  "subscript",
  "superscript",
  "highlight",
  "kbd",
  "abbr",
  "cite",
  "small",
] as const;

/**
 * Every shortcode core registers, in registration order. Source:
 * `coreShortcodes`, widened to `readonly ShortcodeSpec[]` exactly like
 * `coreBlocks`, so the binding is the same runtime comparison.
 *
 * Spelled bare rather than as `[year]`: the name is the identity a plugin's
 * `registerShortcode` overrides — core loses a tie silently, so the page is
 * the only place a reader learns the name was taken — and the brackets are
 * the syntax around it, not the item.
 */
const CORE_SHORTCODES = ["year", "month"] as const;

// --- Islands ---------------------------------------------------------------

/** Source: `PlumixStrategy`. */
const HYDRATION_STRATEGIES = [
  "load",
  "idle",
  "visible",
  "interaction",
  "only",
] as const;

type _HydrationStrategiesMatchSource = Assert<
  Equals<(typeof HYDRATION_STRATEGIES)[number], PlumixStrategy>
>;

/**
 * The strategies also valid as a prefetch trigger. Source: `PlumixPrefetch` —
 * a subset of the above, which is why the page is a two-axis roster rather
 * than one list with a footnote.
 */
const PREFETCH_TRIGGERS = ["load", "idle", "visible"] as const;

type _PrefetchTriggersMatchSource = Assert<
  Equals<(typeof PREFETCH_TRIGGERS)[number], PlumixPrefetch>
>;

/**
 * Both axes on one page. The prop each value belongs to is part of the item
 * id, because `load` names a strategy *and* a prefetch trigger — bare, the two
 * would be one heading and one anchor.
 */
const HYDRATION: readonly string[] = [
  ...HYDRATION_STRATEGIES.map((strategy) => `client="${strategy}"`),
  ...PREFETCH_TRIGGERS.map((trigger) => `prefetch="${trigger}"`),
];

// --- Themes ----------------------------------------------------------------

type FacadeExport = keyof typeof PlumixFacade;

/**
 * The generic tiers, in resolution order. Source: `GenericTier`, the union a
 * `TemplateRule` carries — so the ids are the tiers rather than the builder
 * functions that mint them. The second assertion is what keeps those the same
 * names: nothing in source ties `entry()` the builder to `"entry"` the tier,
 * so renaming the builder would otherwise leave the roster passing.
 */
const GENERIC_TIERS = [
  "fallback",
  "entry",
  "archive",
  "taxonomy",
  "author",
  "date",
  "frontPage",
  "search",
  "notFound",
  "serverError",
] as const;

type _GenericTiersMatchSource = Assert<
  Equals<(typeof GENERIC_TIERS)[number], GenericTier>
>;

type _GenericTiersAreFacadeExports = Assert<
  (typeof GENERIC_TIERS)[number] extends FacadeExport ? true : false
>;

/**
 * The targeted matchers, listed against the node kinds they mint. `satisfies`
 * pins each key to a façade export, so a rename fails on the offending line;
 * the assertion pins the kinds, flattened, to `TargetMatcher["nodeKind"]`, so
 * a sixth matcher reaching a new kind fails too.
 *
 * Two things neither catches, both needing the builders to share a return
 * shape they do not have: a sixth matcher minting an *existing* kind, and a
 * key paired with the wrong kinds. The values are a reader's map from matcher
 * to node kind and a lever for the second assertion — they are not themselves
 * checked against what each builder does.
 */
const TARGETED_MATCHERS = {
  forEntryType: ["content", "content-type-archive"],
  forTermTaxonomy: ["term"],
  forAuthor: ["author"],
  forDate: ["date"],
  forArchiveType: ["custom"],
} as const satisfies Partial<
  Record<FacadeExport, readonly TargetMatcher["nodeKind"][]>
>;

type _TargetedMatchersCoverEveryNodeKind = Assert<
  Equals<
    (typeof TARGETED_MATCHERS)[keyof typeof TARGETED_MATCHERS][number],
    TargetMatcher["nodeKind"]
  >
>;

/** `defineTemplate` heads the page: every rule below wraps one. */
const TEMPLATES: readonly string[] = [
  "defineTemplate" satisfies FacadeExport,
  ...GENERIC_TIERS,
  ...Object.keys(TARGETED_MATCHERS),
];

/**
 * Every shape a template can receive, named as a reader would import it.
 * Source: the `TemplateData` union.
 *
 * The map is the binding: its values are the real types, so a rename or
 * removal fails to compile, and the union of its values is asserted to be
 * `TemplateData` itself, so a tenth shape fails typecheck. A bare array of
 * names could not do either — type names have no runtime form to compare.
 */
interface TemplateDataShapes {
  EntryData: EntryData;
  ArchiveData: ArchiveData;
  TaxonomyData: TaxonomyData;
  AuthorArchiveData: AuthorArchiveData;
  DateArchiveData: DateArchiveData;
  CustomArchiveData: CustomArchiveData;
  FrontPageData: FrontPageData;
  SearchData: SearchData;
  ErrorData: ErrorData;
}

type _TemplateDataShapesMatchSource = Assert<
  Equals<TemplateDataShapes[keyof TemplateDataShapes], TemplateData>
>;

const TEMPLATE_DATA = [
  "EntryData",
  "ArchiveData",
  "TaxonomyData",
  "AuthorArchiveData",
  "DateArchiveData",
  "CustomArchiveData",
  "FrontPageData",
  "SearchData",
  "ErrorData",
] as const;

type _TemplateDataMatchesShapes = Assert<
  Equals<(typeof TEMPLATE_DATA)[number], keyof TemplateDataShapes>
>;

// --- Access & Identity -----------------------------------------------------

/** The roles, ascending. Source: `USER_ROLES`. */
const ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const;

type _RolesMatchSource = Assert<Equals<(typeof ROLES)[number], UserRole>>;

/**
 * The core capabilities, then the actions derived for every other entry type
 * and taxonomy. Sources: `CORE_CAPABILITIES`, `POST_TYPE_CAPABILITY_ACTIONS`,
 * `TERM_TAXONOMY_CAPABILITY_ACTIONS`.
 *
 * The derived actions are spelled `entry:*:read` rather than bare `read`,
 * following how `rbac.ts` itself writes `entry:post:*`: an id is unique on its
 * page, and `read` names both an entry action and a taxonomy one.
 *
 * Bound at runtime as a whole. `CORE_CAPABILITIES` is annotated
 * `Record<string, UserRole>`, so its keys are `string` at the type level even
 * though they are literals in source — binding half the list one way and half
 * the other would cost a reader more than it buys.
 */
const CAPABILITIES = [
  "entry:post:read",
  "entry:post:create",
  "entry:post:edit_own",
  "entry:post:publish",
  "entry:post:edit_any",
  "entry:post:delete",
  "entry:post:read_revisions",
  "entry:post:restore_revision",
  "user:list",
  "user:edit_own",
  "user:create",
  "user:edit",
  "user:promote",
  "user:delete",
  "user:manage_tokens",
  "plugin:manage",
  "settings:manage",
  "entry:*:read",
  "entry:*:create",
  "entry:*:edit_own",
  "entry:*:publish",
  "entry:*:edit_any",
  "entry:*:delete",
  "entry:*:read_revisions",
  "entry:*:restore_revision",
  "term:*:read",
  "term:*:assign",
  "term:*:edit",
  "term:*:delete",
  "term:*:manage",
] as const;

// --- APIs ------------------------------------------------------------------

/**
 * The tools core contributes unconditionally, then the ones the dev gate adds.
 * Sources: `coreMcpTools`, `telemetryMcpTools`, `errorMcpTools`.
 *
 * **Page-bound only.** All three arrays live in `@plumix/core`'s
 * `mcp/registry.ts` and its siblings, and none is re-exported from the package
 * barrel — `mcp/index.ts` publishes the `McpTool` type and `McpToolError` and
 * nothing else. A relative import could physically reach them; what forbids it
 * is this file's own rule, that a roster binds to the surface a reader can
 * import.
 *
 * So a source binding here means *publishing* API, which is a different act
 * from forwarding something already public — the distinction that let
 * `coreShortcodes` onto the façade in the same change that left this unbound.
 * `coreMcpTools` has the better case of the three (`registerMcpTool` already
 * rejects a plugin tool colliding with `CORE_MCP_TOOL_NAMES`, derived from
 * it); whether the dev-only two belong on a public surface at all is the MCP
 * page's decision, not this guard's.
 */
const MCP_TOOLS = [
  "schema_describe",
  "content_list",
  "content_get",
  "term_list",
  "term_get",
  "taxonomy_list",
  "telemetry_requests_list",
  "telemetry_request_get",
  "error_list",
] as const;

// --- Hooks -----------------------------------------------------------------

/**
 * A hook name as its registry spells it. The per-entry-type hooks are template
 * literals over the type name (`entry:${string}:published`), which no heading
 * can carry, so a page writes `entry:*:published` and this puts the parameter
 * back before the comparison. Exported so `rosters.test.ts` can prove the
 * substitution does not blunt the assertion it feeds.
 */
export type SourceHookName<TName extends string> =
  TName extends `entry:*:${infer TSuffix}`
    ? `entry:${string}:${TSuffix}`
    : TName;

/**
 * Every filter, grouped by family and with the mechanical `rpc:*` family last.
 * Source: `FilterName`, which is `keyof FilterRegistry` — an interface every
 * hook augments from wherever it is fired, so there is no runtime value and
 * the type-level binding is the only one there can be.
 *
 * A filter reaches this union only if its declaring module is in the closure
 * `@plumix/core`'s barrel anchors (`hooks/public-hooks.ts`). That is the same
 * boundary a plugin author sees, so a hook missing from here is a hook they
 * cannot type either — which is why the roster follows the façade rather than
 * the repo. The dev-only `debug_bar:panels`, `error_page:panels` and
 * `error_page:hints` are outside it, and the Dev Tools page documents them.
 */
const FILTER_HOOKS = [
  "admin_bar:nodes",
  "admin:search:results",
  "block:before_render",
  "block:after_render",
  "blocks:loader:error",
  "entry:before_save",
  "entry:*:before_save",
  "render:document",
  "resolve:single:data",
  "resolve:archive:data",
  "resolve:term:data",
  "resolve:author:data",
  "resolve:date:data",
  "resolve:front-page:data",
  "resolve:search:data",
  "seo:feed:items",
  "seo:og_image",
  "seo:robots-txt",
  "seo:sitemap:urls",
  "theme:document",
  "rpc:entry.list:input",
  "rpc:entry.list:output",
  "rpc:entry.get:input",
  "rpc:entry.get:output",
  "rpc:entry.create:input",
  "rpc:entry.create:output",
  "rpc:entry.update:input",
  "rpc:entry.update:output",
  "rpc:entry.trash:input",
  "rpc:entry.trash:output",
  "rpc:entry.restore:input",
  "rpc:entry.restore:output",
  "rpc:entry.deletePermanent:input",
  "rpc:entry.deletePermanent:output",
  "rpc:entry.duplicate:input",
  "rpc:entry.duplicate:output",
  "rpc:user.list:input",
  "rpc:user.list:output",
  "rpc:user.get:output",
  "rpc:user.invite:input",
  "rpc:user.invite:output",
  "rpc:user.update:input",
  "rpc:user.update:output",
  "rpc:user.disable:input",
  "rpc:user.disable:output",
  "rpc:user.enable:input",
  "rpc:user.enable:output",
  "rpc:user.delete:output",
  "rpc:term.list:input",
  "rpc:term.list:output",
  "rpc:term.get:output",
  "rpc:term.create:input",
  "rpc:term.create:output",
  "rpc:term.update:input",
  "rpc:term.update:output",
  "rpc:term.delete:output",
  "rpc:settings.get:input",
  "rpc:settings.get:output",
  "rpc:settings.upsert:input",
  "rpc:settings.upsert:output",
] as const;

type _FilterHooksMatchSource = Assert<
  Equals<SourceHookName<(typeof FILTER_HOOKS)[number]>, FilterName>
>;

type _EveryPerTypeFilterUsesTheStar = Assert<
  Equals<
    Extract<(typeof FILTER_HOOKS)[number], `entry:${string}:${string}`>,
    Extract<(typeof FILTER_HOOKS)[number], `entry:*:${string}`>
  >
>;

/**
 * Every action, grouped by family. Source: `ActionName` — same registry
 * mechanism as the filters above, same reason for the type-level binding.
 *
 * Each entry action fires twice: once per-type (`entry:*:published`) and once
 * generic (`entry:published`). Both are items, because a plugin author picks
 * between them.
 */
const ACTION_HOOKS = [
  "entry:*:published",
  "entry:*:updated",
  "entry:*:trashed",
  "entry:*:restored",
  "entry:*:deleted",
  "entry:*:transition",
  "entry:*:revision_created",
  "entry:*:revision_pruned",
  "entry:*:revision_restored",
  "entry:*:autosave_saved",
  "entry:*:autosave_discarded",
  "entry:published",
  "entry:updated",
  "entry:trashed",
  "entry:restored",
  "entry:deleted",
  "entry:transition",
  "entry:revision_created",
  "entry:revision_pruned",
  "entry:revision_restored",
  "entry:autosave_saved",
  "entry:autosave_discarded",
  "entry:meta_changed",
  "term:created",
  "term:updated",
  "term:deleted",
  "term:meta_changed",
  "user:invited",
  "user:registered",
  "user:updated",
  "user:meta_changed",
  "user:status_changed",
  "user:deleted",
  "user:signed_in",
  "user:signed_out",
  "user:email_change_requested",
  "user:email_changed",
  "credential:created",
  "credential:revoked",
  "credential:renamed",
  "session:revoked",
  "api_token:created",
  "api_token:revoked",
  "device_code:approved",
  "device_code:denied",
  "settings:group_changed",
] as const;

type _ActionHooksMatchSource = Assert<
  Equals<SourceHookName<(typeof ACTION_HOOKS)[number]>, ActionName>
>;

// A per-type hook spelled with a concrete type — `entry:post:published` — is
// absorbed by its template-literal sibling when TypeScript reduces the union,
// so the bindings above would accept it and the page would then owe a heading
// for a name no registry spells. `CAPABILITIES` legitimately writes
// `entry:post:read`, which is what puts the spelling in reach of this file, so
// the two lists say in types which convention each follows.
type _EveryPerTypeActionUsesTheStar = Assert<
  Equals<
    Extract<(typeof ACTION_HOOKS)[number], `entry:${string}:${string}`>,
    Extract<(typeof ACTION_HOOKS)[number], `entry:*:${string}`>
  >
>;

const HOOKS: readonly string[] = [...FILTER_HOOKS, ...ACTION_HOOKS];

// --- Going Further ---------------------------------------------------------

/**
 * The whole cache-tag vocabulary, coarse by design. Sources: `typeTag` and
 * `entryTag`, the only tag minters the façade exports.
 *
 * A third tag kind would need a third minter, and adding one without a heading
 * here is the drift a reader would feel — the page promises the vocabulary is
 * these two.
 */
const CACHE_TAGS = ["t:*", "e:*"] as const;

// --- Deployment ------------------------------------------------------------

/**
 * Every command, then the global flags that precede any of them. Sources: the
 * CLI's `BUILT_IN_COMMANDS` map (`migrate`, `doctor`, `i18n`), the runtime
 * adapter's `commands` registry (`dev`, `build`, `deploy`, `types`), and the
 * usage block `formatHelp` prints.
 *
 * **Page-bound only.** `BUILT_IN_COMMANDS` and the flag list are module-private
 * inside `packages/plumix`'s CLI entry, which has no `exports` subpath at all.
 * The adapter half is public, but reaching it means this app taking a
 * dependency on `@plumix/runtime-cloudflare` — a runtime adapter, not the
 * façade the documentation describes, and one of several a site may deploy to.
 * Publishing a `plumix/cli` subpath would bind the whole list through the one
 * surface a reader has.
 */
const CLI_REFERENCE = [
  "dev",
  "build",
  "deploy",
  "types",
  "migrate",
  "doctor",
  "i18n",
  "--config",
  "--cwd",
  "--verbose",
  "--help",
  "--version",
] as const;

/**
 * How a roster's items reach the source they enumerate. Naming it per entry is
 * what makes losing a binding visible: deleting an `Assert` is a one-line diff
 * that changes no count, whereas demoting an entry to `"page-only"` shows up
 * against the tally `rosters.test.ts` keeps.
 */
type Binding = "type-level" | "runtime" | "page-only";

interface RegisteredRoster extends Roster {
  readonly binding: Binding;
}

/**
 * Every roster, keyed by the page that carries it, in site order.
 * `rosters.test.ts` asserts the count and the tally per binding, so neither a
 * new roster nor a demoted one arrives without someone deciding about it.
 */
export const ROSTERS: readonly RegisteredRoster[] = [
  {
    page: "getting-started/project-structure.mdx",
    items: FACADE_SUBPATHS,
    binding: "runtime",
  },
  {
    page: "getting-started/configuration.mdx",
    items: CONFIG_OPTIONS,
    binding: "type-level",
  },
  {
    page: "content-modelling/statuses.mdx",
    items: STATUSES,
    binding: "type-level",
  },
  {
    page: "content-modelling/entry-type-reference.mdx",
    items: ENTRY_TYPE_REFERENCE,
    binding: "type-level",
  },
  { page: "fields/field-types.mdx", items: FIELD_TYPES, binding: "type-level" },
  { page: "blocks/core-blocks.mdx", items: CORE_BLOCKS, binding: "runtime" },
  { page: "blocks/marks.mdx", items: CORE_MARKS, binding: "runtime" },
  { page: "blocks/shortcodes.mdx", items: CORE_SHORTCODES, binding: "runtime" },
  { page: "islands/hydration.mdx", items: HYDRATION, binding: "type-level" },
  { page: "themes/templates.mdx", items: TEMPLATES, binding: "type-level" },
  {
    page: "themes/template-data.mdx",
    items: TEMPLATE_DATA,
    binding: "type-level",
  },
  { page: "access/roles.mdx", items: ROLES, binding: "type-level" },
  { page: "access/capabilities.mdx", items: CAPABILITIES, binding: "runtime" },
  { page: "apis/mcp.mdx", items: MCP_TOOLS, binding: "page-only" },
  { page: "hooks/reference.mdx", items: HOOKS, binding: "type-level" },
  { page: "going-further/caching.mdx", items: CACHE_TAGS, binding: "runtime" },
  { page: "deployment/cli.mdx", items: CLI_REFERENCE, binding: "page-only" },
];
