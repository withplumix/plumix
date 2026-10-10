// Each published export is recorded as a decision; a build test fails on an
// export without a row or a row without an export.

export interface Row {
  /** Who imports these names, and why. */
  readonly reason: string;
  readonly names: readonly string[];
}

/**
 * A plugin's `./schema` subpath is its `schemaModule`: the site's generated
 * schema module re-exports it whole, which is how drizzle-kit migrates the
 * tables and `ctx.db` is typed over them.
 */
const SCHEMA_MODULE =
  "the plugin's `schemaModule`, which the site's generated schema module " +
  "re-exports whole for drizzle-kit and `ctx.db`, with the row types a " +
  "query against those tables names";

/** Package name → `exports` subpath → rows. */
export const ROSTER: Readonly<
  Record<string, Readonly<Record<string, readonly Row[]>>>
> = {
  "@plumix/plugin-audit-log": {
    ".": [
      {
        reason:
          "the factory a site config installs, its options and the storage " +
          "seam a deploy swaps for its own sink",
        names: [
          "auditLog",
          "AuditLogPluginOptions",
          "AuditLogStorage",
          "AuditLogRow",
          "AuditLogQueryFilter",
          "sqlite",
        ],
      },
      {
        reason:
          "`ctx.audit`, which a plugin subscribing to its own events logs " +
          "through when this plugin is installed",
        names: ["AuditExtension", "AuditLogInput"],
      },
      {
        reason:
          "retention: the `retention` option's shape, and the purge its doc " +
          "comment tells an ops script or scheduled handler to call",
        names: [
          "AuditLogRetentionConfig",
          "AuditLogRetentionPolicy",
          "DEFAULT_RETENTION",
          "runRetentionPurge",
          "RunRetentionPurgeArgs",
          "RunRetentionPurgeResult",
        ],
      },
    ],
    "./server": [
      {
        reason:
          "the default storage for a server-only config that must not pull " +
          "the admin bundle's peers into the worker chunk",
        names: ["sqlite"],
      },
    ],
    "./schema": [
      { reason: SCHEMA_MODULE, names: ["auditLog", "NewAuditLogRow"] },
    ],
  },
  "@plumix/plugin-blog": {
    ".": [
      {
        reason:
          "the factory a site config installs and the override shapes its " +
          "options take",
        names: [
          "blog",
          "BlogOptions",
          "EntryTypeOverride",
          "TermTaxonomyOverride",
          "RelatedPostsOptions",
        ],
      },
      {
        reason:
          "the `relatedPosts` template dep's value, which a theme types its " +
          "render arg with",
        names: ["RelatedPosts"],
      },
    ],
  },
  "@plumix/plugin-comments": {
    ".": [
      {
        reason: "the factory a site config installs and its options",
        names: ["comments", "CommentsConfig", "ModerationMode"],
      },
      {
        reason:
          "a comment's status, which a theme and a `comment:*` subscriber " +
          "branch on",
        names: ["CommentStatus", "COMMENT_STATUSES"],
      },
    ],
    "./server": [
      {
        reason:
          "the `comments` template dep's thread, which a theme types its " +
          "render arg with or loads itself",
        names: ["ResolvedComment", "ResolvedThread", "loadThread"],
      },
      {
        reason:
          "the payload of the `comment:moderate` filter, for a moderation " +
          "plugin subscribing to it",
        names: ["CommentModerationCandidate"],
      },
    ],
    "./theme": [
      {
        reason: "the comment form a theme renders, and what it reports",
        names: ["PlumixCommentForm", "CommentFormError", "CommentFormValues"],
      },
    ],
    "./hooks": [
      {
        reason:
          "the headless comment form, for a theme driving its own controls",
        names: [
          "usePlumixCommentForm",
          "PlumixCommentFormState",
          "CommentDraft",
          "CommentFormError",
          "CommentStatus",
        ],
      },
      {
        reason:
          "the headless load-more, for a theme island paging in older root " +
          "comments and rendering them with its own item component",
        names: [
          "usePlumixCommentThread",
          "PlumixCommentThreadState",
          "ResolvedComment",
        ],
      },
    ],
    "./schema": [
      { reason: SCHEMA_MODULE, names: ["comments", "Comment", "NewComment"] },
    ],
  },
  "@plumix/plugin-feeds": {
    ".": [
      {
        reason:
          "the factory a site config installs, and the `feed` option an " +
          "archive registration takes",
        names: ["feeds", "ArchiveTypeFeed"],
      },
      {
        reason:
          "the cap `ArchiveTypeFeed`'s doc comment promises a feed is read to",
        names: ["FEED_LIMIT"],
      },
      {
        reason:
          "the payload of the `feed:items` filter, for a plugin subscribing " +
          "to it",
        names: ["FeedItem", "FeedScope"],
      },
      {
        reason:
          "the channel a feed is served under and its two formats, kept as " +
          "the feed vocabulary when the renderers that took them left (#2461)",
        names: ["FeedChannel", "FeedFormat"],
      },
    ],
  },
  "@plumix/plugin-forms": {
    ".": [
      {
        reason:
          "the factory a site config installs and the form definitions it " +
          "takes",
        names: [
          "forms",
          "FormsConfig",
          "defineForm",
          "pageBreak",
          "FormDefinition",
          "FormDefinitionInput",
          "FormElementInput",
          "FormPageBreak",
          "FormPageBreakEntry",
          "FormStep",
          "FormBinding",
          "FormBound",
          "BoundType",
          "BOUND_TYPES",
          "TurnstileConfig",
          "TurnstileWire",
          "FormWire",
        ],
      },
      {
        reason:
          "what a form's own handler and validator are handed and answer " +
          "with, and the error they throw",
        names: [
          "FormHandler",
          "FormValidator",
          "FormSubmitEvent",
          "FormValidateEvent",
          "FormSubmitResponse",
          "FormAnswers",
          "FormAnswersOf",
          "FormFieldError",
          "FormsError",
        ],
      },
      {
        reason:
          "a submission as the `form:validate` / `form:submitted` hooks hand " +
          "it to a subscriber, and the README's `formatSubmission` that " +
          "renders one for a notification",
        names: [
          "formatSubmission",
          "FormSubmissionCandidate",
          "SubmissionStatus",
          "SUBMISSION_STATUSES",
          "FormLabelSnapshot",
          "FieldLabelSnapshot",
        ],
      },
      {
        reason:
          "the submissions RPC's wire shapes, declared at the entry on " +
          "purpose for a client reading the inbox over that RPC",
        names: [
          "SubmissionDTO",
          "SubmissionFilter",
          "SubmissionsPage",
          "SubmissionCounts",
          "FormSummary",
        ],
      },
      {
        reason:
          "the capability a site config grants a role to moderate " +
          "submissions",
        names: ["SUBMISSION_MODERATE_CAPABILITY"],
      },
    ],
    "./theme": [
      {
        reason: "the form a theme renders, and the wire it renders from",
        names: ["PlumixForm", "formWire", "FormWire", "FormFieldError"],
      },
    ],
    "./hooks": [
      {
        reason: "the headless form, for a theme driving its own controls",
        names: [
          "usePlumixForm",
          "PlumixFormState",
          "FormSubmitAnswers",
          "FormWire",
          "FormFieldError",
        ],
      },
    ],
    "./fields": [
      {
        reason:
          "the field builder this plugin adds beside `plumix/fields`, for a " +
          "form definition",
        names: ["tel"],
      },
    ],
    "./schema": [
      {
        reason: SCHEMA_MODULE,
        names: [
          "formSubmissions",
          "formLabelSnapshots",
          "FormSubmission",
          "NewFormSubmission",
          "StoredSubmission",
        ],
      },
    ],
  },
  "@plumix/plugin-media": {
    ".": [
      {
        reason:
          "the factory a site config installs, and the defaults its upload " +
          "options start from",
        names: ["media", "DEFAULT_ACCEPTED_TYPES", "DEFAULT_MAX_UPLOAD_SIZE"],
      },
      {
        reason:
          "a media field's stored reference and scope, which a theme reading " +
          "the field types it with",
        names: ["MediaReference", "MediaFieldScope"],
      },
    ],
    "./fields": [
      {
        reason:
          "the media field builder, apart from the root's `media()` factory " +
          "it would otherwise collide with",
        names: ["media", "MediaFieldBuilder"],
      },
    ],
  },
  "@plumix/plugin-menu": {
    ".": [
      {
        reason: "the factory a site config installs and its options",
        names: ["menu", "MenuPluginOptions"],
      },
    ],
    "./server": [
      {
        reason:
          "what a theme reads a menu by name or location with, one or many " +
          "in one query",
        names: [
          "getMenuByName",
          "getMenusByName",
          "getMenuForLocation",
          "getMenusForLocations",
        ],
      },
      {
        reason:
          "the resolved menu a theme renders, and the location options and " +
          "item meta a site config declares",
        names: [
          "ResolvedMenu",
          "ResolvedMenuItem",
          "ResolvedMenuItemSource",
          "MenuLocationOptions",
          "RegisteredMenuLocation",
          "MenuItemMeta",
          "MenuItemCustomMeta",
          "MenuItemEntryMeta",
          "MenuItemTermMeta",
          "MenuItemDisplayAttrs",
        ],
      },
    ],
  },
  "@plumix/plugin-og": {
    ".": [
      {
        reason: "the factory a site config installs and its options",
        names: ["og", "OgPluginOptions"],
      },
      {
        reason:
          "what a site config declares a card with: the definition, the rule " +
          "that selects it, and the key a template names it by",
        names: [
          "card",
          "cardKey",
          "CardKey",
          "CardArgs",
          "CardDefinition",
          "CardMode",
          "CardRule",
          "CardSelector",
          "CardPalette",
        ],
      },
      {
        reason:
          "the renderer seam a site config fills: the node tree a card " +
          "renders to, what a renderer declares it reads, and the remote " +
          "renderer",
        names: [
          "CardRenderer",
          "CardRenderInput",
          "CardNode",
          "CardContainerNode",
          "CardImageNode",
          "CardTextNode",
          "CardImage",
          "CardFontSupport",
          "FontFormat",
          "BUNDLED_ENGINE_FONTS",
          "remote",
          "RemoteRendererOptions",
        ],
      },
      {
        reason:
          "what the card preview reports, for a plugin reading why a page " +
          "got the image it did",
        names: ["CardPreview", "CardPreviewOutcome"],
      },
    ],
    "./takumi": [
      {
        reason:
          "the bundled renderers, on their own subpath so the engine's wasm " +
          "stays off the graph of a site that installs a different one",
        names: ["takumi", "svgOnly", "TakumiOptions"],
      },
    ],
  },
  "@plumix/plugin-pages": {
    ".": [
      {
        reason: "the factory a site config installs and its options",
        names: ["pages", "PagesOptions"],
      },
    ],
  },
  "@plumix/plugin-search": {
    ".": [
      {
        reason: "the factory a site config installs and its options",
        names: ["search", "SearchConfig", "RankingAlgorithm"],
      },
      {
        reason: "the search archive's data, which a theme's template renders",
        names: ["SearchArchiveData", "SearchResult"],
      },
    ],
    "./schema": [
      {
        reason: SCHEMA_MODULE,
        names: [
          "searchDocuments",
          "searchReindexRuns",
          "NewSearchDocument",
          "SearchReindexRun",
          "SearchSourceType",
          "ReindexStatus",
          "REINDEX_STATUSES",
        ],
      },
    ],
  },
  "@plumix/plugin-seo": {
    ".": [
      {
        reason: "the factory a site config installs and its options",
        names: ["seo", "SeoOptions", "SeoMetaBoxOptions"],
      },
      {
        reason:
          "the value type of the `seo:og_image` filter, from the package " +
          "that declares it (plugin-og subscribes)",
        names: ["OgImage"],
      },
      {
        reason:
          "the sitemap: the source a plugin hands `ctx.registerSitemap`, " +
          "the `seo:sitemap:urls` payload and the scope it names, its page " +
          "size, and the tag a subscriber retires its rows under",
        names: [
          "SitemapSource",
          "SitemapUrl",
          "SitemapChangeFrequency",
          "SitemapScopeRef",
          "SITEMAP_PAGE_SIZE",
          "SITEMAP_TAG",
        ],
      },
      {
        reason:
          "the site's sitemap policy: the `sitemaps` option `seo()` takes " +
          "and the per-scope defaults it holds",
        names: ["SeoSitemapsOptions", "SitemapScopePolicy"],
      },
      {
        reason:
          "the site-wide answers the head reads, for a plugin ending the " +
          "`og:image` chain the way this one does (plugin-og)",
        names: ["SeoSettings", "loadSeoSettings"],
      },
      {
        reason:
          "the one answer behind the robots directive and sitemap " +
          "membership, and the meta keys an editor's answers are stored under",
        names: [
          "indexable",
          "Indexability",
          "IndexabilityReason",
          "SEO_META_KEYS",
        ],
      },
      {
        reason:
          "the structured-data vocabulary for a plugin describing its " +
          "content through the `seo:schema:*` filters, and the serializer " +
          "for one emitting a script of its own",
        names: [
          "SchemaPiece",
          "SchemaPieceName",
          "SchemaType",
          "SCHEMA_TYPES",
          "DEFAULT_SCHEMA_TYPE",
          "serializeJsonLd",
        ],
      },
      {
        reason:
          "the breadcrumb trail and the component a theme draws it with, " +
          "one source with the graph's `BreadcrumbList`",
        names: ["Breadcrumbs", "breadcrumbTrail", "BreadcrumbItem"],
      },
    ],
  },
  "@plumix/runtime-bun": {
    ".": [
      {
        reason: "the adapter and the database slot a site config wires",
        names: [
          "bun",
          "BunConfig",
          "BunRuntimeAdapter",
          "ResolvedBunConfig",
          "bunSqlite",
          "BunSqliteConfig",
          "BunSqliteDatabase",
          "BunSqliteDatabaseAdapter",
        ],
      },
      {
        reason:
          "the storage slots a site config wires: on disk by default, or " +
          "any S3-compatible bucket",
        names: [
          "diskStorage",
          "DiskObjectStorage",
          "DiskStorageConfig",
          "bunS3",
          "BunS3Config",
          "BunS3ObjectStorage",
        ],
      },
      {
        reason:
          "the image-delivery slot a site config wires, which the media " +
          "plugin requires",
        names: ["images", "ImagesConfig"],
      },
      {
        reason:
          "what the generated entry calls — `.env` loaded when run, the " +
          "site built, the process served — and the site and serve " +
          "options it hands an embedder mounting it in its own `Bun.serve`, " +
          "with the options its `startCron` takes",
        names: [
          "createBunSite",
          "loadEnvFileWhenMain",
          "serveProcess",
          "BunCronOverrides",
          "BunSite",
          "BunSiteHandler",
          "BunSiteOptions",
          "BunSiteServe",
        ],
      },
      {
        reason:
          "the assets layer `createBunSite` serves ahead of the handler, " +
          "for a host that assembles its own",
        names: ["createAssetsLayer", "AssetsLayer", "AssetsLayerOptions"],
      },
    ],
    "./commands": [
      {
        reason:
          "the CLI commands `plumix` loads from the configured runtime, and " +
          "how `plumix migrate` opens its database",
        names: ["commands", "migrations"],
      },
    ],
  },
  "@plumix/runtime-cloudflare": {
    ".": [
      {
        reason:
          "the adapter and bindings a site config wires: D1, KV, R2, " +
          "Images, and the deploy origin",
        names: [
          "cloudflare",
          "d1",
          "D1Config",
          "D1DatabaseAdapter",
          "kv",
          "KVConfig",
          "KVInstance",
          "r2",
          "R2Config",
          "R2ObjectStorage",
          "R2S3Credentials",
          "images",
          "ImagesConfig",
          "cloudflareDeployOrigin",
          "DeployOrigin",
          "DeployOriginInput",
        ],
      },
      {
        reason:
          "Cloudflare Access sign-in, which a site config's `auth` takes, " +
          "and the logout URL a theme links to",
        names: ["cfAccess", "cfAccessLogoutUrl", "CfAccessConfig"],
      },
      {
        reason:
          "what the generated Worker entry's `scheduled` handler calls to " +
          "fail a firing whose tasks failed",
        names: ["surfaceScheduledFailure", "ScheduledFiring"],
      },
    ],
    "./commands": [
      {
        reason:
          "the CLI commands `plumix` loads from the configured runtime, and " +
          "how `plumix migrate` opens its database",
        names: ["commands", "migrations"],
      },
    ],
    "./demo": [
      {
        reason:
          "the anonymous try-the-editor sandbox, which `apps/demo` imports " +
          "on purpose; `demoPreset` composes the rest for it",
        names: [
          "demoPreset",
          "DemoPresetConfig",
          "demoRuntime",
          "DemoRuntimeConfig",
          "demoDatabase",
          "DemoDatabaseConfig",
          "DemoSqlExecutor",
          "demoAuthenticator",
          "DEMO_ADMIN",
          "hasDemoSession",
          "TurnstileConfig",
        ],
      },
    ],
    "./demo/durable-object": [
      {
        reason:
          "the sandbox's Durable Object, which `apps/demo`'s generated " +
          "Worker re-exports; kept off `./demo` so the config graph never " +
          "loads `cloudflare:workers`",
        names: ["DemoDB", "DemoQueryResult", "DemoStatement"],
      },
    ],
  },
  "@plumix/runtime-node": {
    ".": [
      {
        reason:
          "the adapter, database and storage a site config wires, and the " +
          "image transforms",
        names: [
          "node",
          "NodeConfig",
          "NodeRuntimeAdapter",
          "nodeSqlite",
          "NodeSqliteConfig",
          "NodeSqliteDatabase",
          "NodeSqliteDatabaseAdapter",
          "diskStorage",
          "DiskObjectStorage",
          "DiskStorageConfig",
          "images",
          "ImagesConfig",
          "ResolvedImagesConfig",
        ],
      },
      {
        reason:
          "what the generated entry calls, and the site it hands an " +
          "embedder",
        names: [
          "createNodeSite",
          "loadEnvFileWhenMain",
          "NodeSite",
          "NodeSiteHandler",
          "NodeSiteOptions",
          "CronOverrides",
        ],
      },
      {
        reason:
          "the layers `createNodeSite` stacks, which the README offers a " +
          "host that assembles its own, and the scheduler it starts",
        names: [
          "createAssetsLayer",
          "AssetsLayer",
          "AssetsLayerOptions",
          "createImageLayer",
          "ImageLayer",
          "ImageLayerOptions",
          "createRequestListener",
          "BridgeOptions",
          "RequestHandler",
          "RequestListener",
          "startScheduledRunner",
          "ScheduledRunnerOptions",
          "Scheduler",
          "SchedulerClock",
          "SchedulerLogger",
        ],
      },
    ],
    "./commands": [
      {
        reason:
          "the CLI commands `plumix` loads from the configured runtime, and " +
          "how `plumix migrate` opens its database",
        names: ["commands", "migrations"],
      },
    ],
  },
  plumix: {
    "./vite": [
      {
        reason: "the Vite plugin a site's `vite.config.ts` installs",
        names: ["plumix", "default", "PlumixVitePluginOptions"],
      },
      {
        reason:
          "the build steps a runtime adapter's `build` and `dev` commands " +
          "run (runtime-cloudflare, runtime-node)",
        names: ["emitPlumixSources", "buildAppClientFirst", "BuildableApp"],
      },
      {
        reason:
          "the shared bodies of a self-hosted runtime's `build` and `dev` " +
          "commands, which the runtime supplies only its configuration to " +
          "(runtime-node, runtime-bun)",
        names: [
          "serverEnvironment",
          "ServerEnvironmentOptions",
          "runBuildCommand",
          "BuildCommandOptions",
          "runDevCommand",
          "DevCommandOptions",
          "DevEntry",
          "DevListener",
          "LoadedSite",
        ],
      },
      {
        reason:
          "a plugin's whole vitest config: the Node and browser test tiers " +
          "its test files pick by name (ADR 0021)",
        names: ["defineTestConfig"],
      },
    ],
  },
};
