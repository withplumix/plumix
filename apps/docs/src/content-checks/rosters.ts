// A roster page claims to list every item, so an omission reads as
// nonexistence. Each list is pinned to its source (here or in
// `rosters.test.ts`) and to its page.

// Item ids are the `###` heading text: MDX cannot parse `{#id}`, and slugs are
// lossy (`userList` and `userlist` share one). Sources are read through the
// `plumix` façade only.

// These unions are what `apps/docs` can reach, and `tsc` reads `plumix` from
// built `.d.ts`. Adding a `@plumix/plugin-*` dependency folds its augmentations
// in and breaks these bindings.
import type {
  ActionName,
  ArchiveTypeData,
  AuthorArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeArchiveData,
  EntryTypeLabels,
  EntryTypeOptions,
  ErrorData,
  FilterName,
  FrontPageData,
  GenericTier,
  Invocation,
  PluginI18nSlot,
  PlumixConfigInput,
  PlumixHandler,
  RuntimeAdapter,
  SearchData,
  TargetMatcher,
  TemplateData,
  TermArchiveData,
  ViewData,
} from "plumix";
import type { PlumixPrefetch, PlumixStrategy } from "plumix/blocks";
import type { CANONICAL_INPUT_TYPES } from "plumix/fields";
import type * as PlumixPlugin from "plumix/plugin";
import type { EntryStatus, UserRole } from "plumix/schema";
import type * as PlumixTheme from "plumix/theme";

import type { Roster } from "./roster-drift";
import type { Assert, Equals } from "./type-assert";

// --- Getting Started -------------------------------------------------------

/**
 * Source: the `exports` map of `packages/plumix/package.json`, in its order.
 */
const FACADE_SUBPATHS = [
  "plumix",
  "plumix/plugin",
  "plumix/cli",
  "plumix/theme",
  "plumix/auth",
  "plumix/runtime",
  "plumix/support",
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
  "plumix/test/conformance",
  "plumix/blocks",
  "plumix/blocks/renderer",
  "plumix/blocks/island-runtime",
  "plumix/blocks/island-renderer",
  "plumix/core/dev-client",
  "plumix/schema",
  "plumix/db",
  "plumix/db/libsql",
  "plumix/cdn/cloudflare",
  "plumix/storage/s3",
  "plumix/fields",
  "plumix/i18n",
  "plumix/test",
  "plumix/editor-runtime",
] as const;

/**
 * Not `PlumixConfig`: that resolved shape carries defaults an author never
 * writes.
 */
const CONFIG_OPTIONS = [
  "runtime",
  "database",
  "auth",
  "storage",
  "imageDelivery",
  "kv",
  "cdn",
  "mailer",
  "mail",
  "theme",
  "plugins",
  "i18n",
  "redirects",
  "routes",
  "basePath",
  "mcp",
  "api",
  "dev",
  "telemetry",
  "blocks",
  "images",
  "vite",
] as const;

interface TypeLevelBindings {
  configOptionsMatchSource: Assert<
    Equals<(typeof CONFIG_OPTIONS)[number], keyof PlumixConfigInput>
  >;
}

// --- Content Modelling -----------------------------------------------------

const STATUSES = ["draft", "published", "scheduled", "trash"] as const;

interface TypeLevelBindings {
  statusesMatchSource: Assert<Equals<(typeof STATUSES)[number], EntryStatus>>;
}

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

interface TypeLevelBindings {
  entryTypeOptionsMatchSource: Assert<
    Equals<(typeof ENTRY_TYPE_OPTIONS)[number], keyof EntryTypeOptions>
  >;
}

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
] as const;

interface TypeLevelBindings {
  entryTypeLabelsMatchSource: Assert<
    Equals<(typeof ENTRY_TYPE_LABELS)[number], keyof EntryTypeLabels>
  >;
}

/**
 * Merged because two rosters on one page would report each other's items as
 * unknown. The `labels.` prefix keeps `notFound` the option apart from
 * `notFound` the label.
 */
const ENTRY_TYPE_REFERENCE: readonly string[] = [
  ...ENTRY_TYPE_OPTIONS,
  ...ENTRY_TYPE_LABELS.map((label) => `labels.${label}`),
];

// --- Fields ----------------------------------------------------------------

/**
 * The retired legacy types and plugin-contributed `media` kinds are
 * deliberately absent.
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

interface TypeLevelBindings {
  fieldTypesMatchSource: Assert<
    Equals<(typeof FIELD_TYPES)[number], (typeof CANONICAL_INPUT_TYPES)[number]>
  >;
}

// --- Blocks ----------------------------------------------------------------

/**
 * Source: `coreBlocks`. Its `readonly BlockSpec[]` annotation widens the names,
 * so the binding is runtime.
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
] as const;

/** Source: `coreMarks`. */
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
 * Source: `coreShortcodes`. Bare, not `[year]`: the name is what a plugin's
 * `registerShortcode` overrides.
 */
const CORE_SHORTCODES = ["year", "month"] as const;

// --- Islands ---------------------------------------------------------------

const HYDRATION_STRATEGIES = [
  "load",
  "idle",
  "visible",
  "interaction",
  "only",
] as const;

interface TypeLevelBindings {
  hydrationStrategiesMatchSource: Assert<
    Equals<(typeof HYDRATION_STRATEGIES)[number], PlumixStrategy>
  >;
}

const PREFETCH_TRIGGERS = ["load", "idle", "visible"] as const;

interface TypeLevelBindings {
  prefetchTriggersMatchSource: Assert<
    Equals<(typeof PREFETCH_TRIGGERS)[number], PlumixPrefetch>
  >;
}

/**
 * The prop is part of the id because `load` is both a strategy and a prefetch
 * trigger.
 */
const HYDRATION: readonly string[] = [
  ...HYDRATION_STRATEGIES.map((strategy) => `client="${strategy}"`),
  ...PREFETCH_TRIGGERS.map((trigger) => `prefetch="${trigger}"`),
];

// --- Themes ----------------------------------------------------------------

/**
 * Constraints only, never an exhaustive set to document: much of each subpath
 * is plumbing no page should name, so a new export fails no roster.
 */
type ThemeExport = keyof typeof PlumixTheme;
type PluginExport = keyof typeof PlumixPlugin;

/**
 * Nothing in source ties the `entry()` builder to the `"entry"` tier, so the
 * second assertion pins the tier names to theme exports.
 */
const GENERIC_TIERS = [
  "fallback",
  "entry",
  "entryType",
  "term",
  "author",
  "date",
  "frontPage",
  "search",
  "notFound",
  "serverError",
] as const;

interface TypeLevelBindings {
  genericTiersMatchSource: Assert<
    Equals<(typeof GENERIC_TIERS)[number], GenericTier>
  >;
}

interface TypeLevelBindings {
  genericTiersAreThemeExports: Assert<
    (typeof GENERIC_TIERS)[number] extends ThemeExport ? true : false
  >;
}

/**
 * Unchecked: a new matcher minting an existing kind, or a key paired with the
 * wrong kinds. The builders share no return shape to compare against.
 */
const TARGETED_MATCHERS = {
  forEntryType: ["entry", "entryType"],
  forTermTaxonomy: ["term"],
  forAuthor: ["author"],
  forDate: ["date"],
  forArchiveType: ["archiveType"],
  forView: ["view"],
} as const satisfies Partial<
  Record<ThemeExport, readonly TargetMatcher["nodeKind"][]>
>;

interface TypeLevelBindings {
  targetedMatchersCoverEveryNodeKind: Assert<
    Equals<
      (typeof TARGETED_MATCHERS)[keyof typeof TARGETED_MATCHERS][number],
      TargetMatcher["nodeKind"]
    >
  >;
}

const TEMPLATES: readonly string[] = [
  "defineTemplate" satisfies ThemeExport,
  ...GENERIC_TIERS,
  ...Object.keys(TARGETED_MATCHERS),
];

/** Values compare as a union, so a swapped pairing passes unnoticed. */
const TARGET_CONSTRUCTORS = {
  entryTypeTargets: "forEntryType",
  termTaxonomyTargets: "forTermTaxonomy",
  authorTargets: "forAuthor",
  dateTargets: "forDate",
  archiveTypeTargets: "forArchiveType",
  viewTargets: "forView",
} as const satisfies Partial<
  Record<PluginExport, keyof typeof TARGETED_MATCHERS>
>;

interface TypeLevelBindings {
  everyTargetedMatcherHasAConstructor: Assert<
    Equals<
      (typeof TARGET_CONSTRUCTORS)[keyof typeof TARGET_CONSTRUCTORS],
      keyof typeof TARGETED_MATCHERS
    >
  >;
}

/**
 * Not exhaustive: nothing in source enumerates these, so a newly published
 * constructor fails nothing.
 */
const MATCH_CONSTRUCTORS = [
  "entryTypeMatch",
  "termTaxonomyMatch",
  "metaEquals",
  "termMetaEquals",
] as const satisfies readonly PluginExport[];

/**
 * A map because type names have no runtime form: its values are the real types.
 */
interface TemplateDataShapes {
  EntryData: EntryData;
  EntryTypeArchiveData: EntryTypeArchiveData;
  TermArchiveData: TermArchiveData;
  AuthorArchiveData: AuthorArchiveData;
  DateArchiveData: DateArchiveData;
  ArchiveTypeData: ArchiveTypeData;
  ViewData: ViewData;
  FrontPageData: FrontPageData;
  SearchData: SearchData;
  ErrorData: ErrorData;
}

interface TypeLevelBindings {
  templateDataShapesMatchSource: Assert<
    Equals<TemplateDataShapes[keyof TemplateDataShapes], TemplateData>
  >;
}

const TEMPLATE_DATA = [
  "EntryData",
  "EntryTypeArchiveData",
  "TermArchiveData",
  "AuthorArchiveData",
  "DateArchiveData",
  "ArchiveTypeData",
  "ViewData",
  "FrontPageData",
  "SearchData",
  "ErrorData",
] as const;

interface TypeLevelBindings {
  templateDataMatchesShapes: Assert<
    Equals<(typeof TEMPLATE_DATA)[number], keyof TemplateDataShapes>
  >;
}

// --- Access & Identity -----------------------------------------------------

const ROLES = [
  "subscriber",
  "contributor",
  "author",
  "editor",
  "admin",
] as const;

interface TypeLevelBindings {
  rolesMatchSource: Assert<Equals<(typeof ROLES)[number], UserRole>>;
}

/**
 * Runtime-bound: `CORE_CAPABILITIES` is a `Record<string, UserRole>`, so its
 * keys are lost at the type level. `entry:*:read` keeps ids unique since `read`
 * is also a taxonomy action.
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
 * Page-only: `coreMcpTools`, `telemetryMcpTools` and `errorMcpTools` are not
 * public, and binding them would mean publishing API.
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
 * Maps a page's `entry:*:published` back to the registry's
 * `entry:${string}:published`, which no heading can carry.
 */
export type SourceHookName<TName extends string> =
  TName extends `entry:*:${infer TSuffix}`
    ? `entry:${string}:${TSuffix}`
    : TName;

const FILTER_HOOKS = [
  "admin_bar:nodes",
  "admin:search:results",
  "block:before_render",
  "block:after_render",
  "blocks:loader:error",
  "debug:panels",
  "entry:before_save",
  "entry:*:before_save",
  "error_page:hints",
  "error_page:panels",
  "render:document",
  "archive:entries",
  "resolve:single:data",
  "resolve:archive:data",
  "resolve:term:data",
  "resolve:author:data",
  "resolve:date:data",
  "resolve:front-page:data",
  "resolve:search:data",
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

interface TypeLevelBindings {
  filterHooksMatchSource: Assert<
    Equals<SourceHookName<(typeof FILTER_HOOKS)[number]>, FilterName>
  >;
}

interface TypeLevelBindings {
  everyPerTypeFilterUsesTheStar: Assert<
    Equals<
      Extract<(typeof FILTER_HOOKS)[number], `entry:${string}:${string}`>,
      Extract<(typeof FILTER_HOOKS)[number], `entry:*:${string}`>
    >
  >;
}

/**
 * Per-type and generic entry actions are both items: each fires, and a plugin
 * author picks one.
 */
const ACTION_HOOKS = [
  "theme:ready",
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

interface TypeLevelBindings {
  actionHooksMatchSource: Assert<
    Equals<SourceHookName<(typeof ACTION_HOOKS)[number]>, ActionName>
  >;
}

/**
 * `entry:post:published` would be absorbed by its template-literal sibling in
 * the union, so the bindings above would accept a name no registry spells.
 */
interface TypeLevelBindings {
  everyPerTypeActionUsesTheStar: Assert<
    Equals<
      Extract<(typeof ACTION_HOOKS)[number], `entry:${string}:${string}`>,
      Extract<(typeof ACTION_HOOKS)[number], `entry:*:${string}`>
    >
  >;
}

const HOOKS: readonly string[] = [...FILTER_HOOKS, ...ACTION_HOOKS];

// --- Deployment ------------------------------------------------------------

/**
 * Sources: `typeTag` and `entryTag`. Spelled `*` because MDX reads a bare
 * `t:<type>` as an unclosed JSX tag.
 */
const CACHE_TAGS = ["t:*", "e:*"] as const;

/**
 * Page-only: `BUILT_IN_COMMANDS` and the flags are private to the CLI entry,
 * and the adapter's `commands` would need a runtime-adapter dependency.
 */
const CLI_REFERENCE = [
  "dev",
  "build",
  "deploy",
  "types",
  "migrate",
  "cron",
  "meta",
  "doctor",
  "i18n",
  "--config",
  "--cwd",
  "--verbose",
  "--help",
  "--version",
] as const;

const INVOCATION_MEMBERS = ["env", "waitUntil", "clientAddress"] as const;

interface TypeLevelBindings {
  invocationMembersMatchSource: Assert<
    Equals<(typeof INVOCATION_MEMBERS)[number], keyof Invocation>
  >;
}

const HANDLER_MEMBERS = ["fetch", "scheduled", "run", "dispose"] as const;

interface TypeLevelBindings {
  handlerMembersMatchSource: Assert<
    Equals<(typeof HANDLER_MEMBERS)[number], keyof PlumixHandler>
  >;
}

const ADAPTER_MEMBERS = [
  "name",
  "handler",
  "generateEntry",
  "workerExports",
  "commandsModule",
  "refusedAdminAreas",
] as const;

interface TypeLevelBindings {
  adapterMembersMatchSource: Assert<
    Equals<(typeof ADAPTER_MEMBERS)[number], keyof RuntimeAdapter>
  >;
}

/**
 * Qualified because with three interfaces on one page `name`, `fetch` and `env`
 * would make useless anchors.
 */
const RUNTIME_CONTRACT_MEMBERS: readonly string[] = [
  ...ADAPTER_MEMBERS.map((member) => `RuntimeAdapter.${member}`),
  ...HANDLER_MEMBERS.map((member) => `PlumixHandler.${member}`),
  ...INVOCATION_MEMBERS.map((member) => `Invocation.${member}`),
];

// --- Plugins ---------------------------------------------------------------

/**
 * Source: non-private manifests under `packages/plugins/`. Membership only,
 * since directory order is alphabetical, which a roster page must not adopt.
 */
const PLUGIN_PACKAGES = [
  "@plumix/plugin-blog",
  "@plumix/plugin-pages",
  "@plumix/plugin-media",
  "@plumix/plugin-menu",
  "@plumix/plugin-comments",
  "@plumix/plugin-forms",
  "@plumix/plugin-audit-log",
  "@plumix/plugin-og",
  "@plumix/plugin-seo",
  "@plumix/plugin-feeds",
  "@plumix/plugin-search",
] as const;

const PLUGIN_I18N_SLOT = ["sourceLocale", "locales", "catalogPath"] as const;

interface TypeLevelBindings {
  pluginI18nSlotMatchesSource: Assert<
    Equals<(typeof PLUGIN_I18N_SLOT)[number], keyof PluginI18nSlot>
  >;
}

/**
 * Naming its `TypeLevelBindings` members makes deleting an assertion fail to
 * compile at the roster citing it.
 */
type Binding =
  | readonly [keyof TypeLevelBindings, ...(keyof TypeLevelBindings)[]]
  | "runtime"
  | "page-only";

interface RegisteredRoster extends Roster {
  readonly binding: Binding;
}

export const ROSTERS: readonly RegisteredRoster[] = [
  {
    page: "getting-started/project-structure.mdx",
    items: FACADE_SUBPATHS,
    binding: "runtime",
  },
  {
    page: "getting-started/configuration.mdx",
    items: CONFIG_OPTIONS,
    binding: ["configOptionsMatchSource"],
  },
  {
    page: "content-modelling/statuses.mdx",
    items: STATUSES,
    binding: ["statusesMatchSource"],
  },
  {
    page: "content-modelling/entry-type-reference.mdx",
    items: ENTRY_TYPE_REFERENCE,
    binding: ["entryTypeOptionsMatchSource", "entryTypeLabelsMatchSource"],
  },
  {
    page: "fields/field-types.mdx",
    items: FIELD_TYPES,
    binding: ["fieldTypesMatchSource"],
  },
  { page: "blocks/core-blocks.mdx", items: CORE_BLOCKS, binding: "runtime" },
  { page: "blocks/marks.mdx", items: CORE_MARKS, binding: "runtime" },
  { page: "blocks/shortcodes.mdx", items: CORE_SHORTCODES, binding: "runtime" },
  {
    page: "islands/hydration.mdx",
    items: HYDRATION,
    binding: ["hydrationStrategiesMatchSource", "prefetchTriggersMatchSource"],
  },
  {
    page: "themes/templates.mdx",
    items: TEMPLATES,
    binding: [
      "genericTiersMatchSource",
      "genericTiersAreThemeExports",
      "targetedMatchersCoverEveryNodeKind",
    ],
  },
  {
    page: "themes/template-data.mdx",
    items: TEMPLATE_DATA,
    binding: ["templateDataShapesMatchSource", "templateDataMatchesShapes"],
  },
  {
    page: "themes/rule-kinds.mdx",
    items: [...Object.keys(TARGET_CONSTRUCTORS), ...MATCH_CONSTRUCTORS],
    binding: ["everyTargetedMatcherHasAConstructor"],
  },
  { page: "access/roles.mdx", items: ROLES, binding: ["rolesMatchSource"] },
  { page: "access/capabilities.mdx", items: CAPABILITIES, binding: "runtime" },
  { page: "apis/mcp.mdx", items: MCP_TOOLS, binding: "page-only" },
  {
    page: "hooks/reference.mdx",
    items: HOOKS,
    binding: [
      "filterHooksMatchSource",
      "everyPerTypeFilterUsesTheStar",
      "actionHooksMatchSource",
      "everyPerTypeActionUsesTheStar",
    ],
  },
  { page: "deployment/cdn.mdx", items: CACHE_TAGS, binding: "runtime" },
  { page: "deployment/cli.mdx", items: CLI_REFERENCE, binding: "page-only" },
  {
    page: "deployment/runtimes.mdx",
    items: RUNTIME_CONTRACT_MEMBERS,
    binding: [
      "adapterMembersMatchSource",
      "handlerMembersMatchSource",
      "invocationMembersMatchSource",
    ],
  },
  { page: "plugins/overview.mdx", items: PLUGIN_PACKAGES, binding: "runtime" },
  {
    page: "plugins/i18n.mdx",
    items: PLUGIN_I18N_SLOT,
    binding: ["pluginI18nSlotMatchesSource"],
  },
];
