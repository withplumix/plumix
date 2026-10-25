import { describe, expect, test } from "vitest";

import type { Namespace, Unloadable } from "../test/facade-entries.js";
import { facadeSpecifier, loadModules } from "../test/facade-entries.js";

// A new export of a curated subpath's source is silently unpublished, so
// every value export must be published or withheld with a reason.

interface Withholding {
  readonly reason: string;
  readonly names: readonly string[];
  /** The subpath that publishes these instead, checked rather than claimed. */
  readonly publishedBy?: string;
}

/**
 * A row records decisions only. Its source is named by specifier and the entry
 * by subpath; the guard loads both from the exports maps.
 */
type Curated =
  | {
      /** One source, or several a subpath gathers under one import. */
      readonly mirrors: string | readonly string[];
      readonly withheld: readonly Withholding[];
    }
  | {
      /**
       * A role's cut of core's barrel: every value it publishes is one the
       * barrel exports, plus names only this subpath adds.
       */
      readonly draws: string;
      readonly adds?: readonly string[];
    };

/**
 * The values core's barrel exports that no subpath publishes. Every other one
 * is published by exactly one subpath, which the tests below check by identity.
 */
const CORE_WITHHELD: readonly Withholding[] = [
  {
    reason:
      "the editing-copy controller and the save queue it writes through, " +
      "which only the admin's own editors use until a plugin editor moves " +
      "onto them (#3241)",
    names: ["createEditingCopy", "createSaveQueue", "LOADING_EDITING_COPY"],
  },
  {
    reason:
      "where core's shipped migration history sits, which only this " +
      "package's own `migrate` command reads",
    names: ["CORE_MIGRATIONS_FOLDER"],
  },
  {
    reason:
      "core's own data migrations, which only `plumix`'s migrate runner reads",
    names: ["CORE_DATA_MIGRATIONS"],
  },
  {
    reason:
      "which tables each core sync scope holds, which only `plumix`'s sync " +
      "command and core's sync contract read",
    names: ["CORE_SYNC_SCOPE_TABLES", "SYNC_AUTH_TABLES"],
  },
  {
    reason:
      "the lines `sync_migrations_differ` lists; a transport calls " +
      "`assertSameHeads`, which throws with them",
    names: ["headDifferences"],
  },
  {
    reason:
      "how `--scope` names resolve to tables, which only `plumix`'s sync " +
      "and import commands and core's sync routes read",
    names: ["resolveScopes"],
  },
  {
    reason: "the check an import runs on each record's meta, a CLI-only need",
    names: ["checkImportedMeta"],
  },
  {
    reason:
      "core's catalogs projected onto a site's enabled locales, which only " +
      "`plumix`'s Vite plugin reads, to serve `virtual:plumix/catalog-locales`",
    names: ["projectCoreCatalogLocales"],
  },
  {
    reason:
      "a scheduled task's budget and how a report names it, which only " +
      "this package's `cron` command reads",
    names: ["formatTimeout", "scheduledTaskTimeoutMs"],
  },
  {
    reason:
      "the send `plumix mail test` and core's mail test route share, which " +
      "only this package's `mail` command calls",
    names: ["sendMailTest"],
  },
  {
    reason:
      "the bearer authenticator that also admits a token bound to one " +
      "audience, which only core's MCP endpoint composes. A site composes " +
      "`apiTokenAuthenticator`, which refuses every bound token.",
    names: ["audienceTokenAuthenticator"],
  },
  {
    reason:
      "the runtime-key half of the shim roster, which admin's runtime " +
      "object and `PlumixAdminRuntime` are typed against. A plugin " +
      "chunk reads those keys through `getRuntime`, not this map.",
    names: ["SHARED_ADMIN_RUNTIME_KEYS"],
  },
  {
    reason:
      "core's own RPC surface — the admin client's routers, their input " +
      "schemas and the entry lifecycle they drive. A plugin builds its " +
      "router from `base`.",
    names: [
      "appRouter",
      "authRouter",
      "entryRouter",
      "settingsRouter",
      "termRouter",
      "userRouter",
      "authSessionOutputSchema",
      "entryCreateInputSchema",
      "entryGetInputSchema",
      "entryListInputSchema",
      "ENTRY_LIST_ORDER_COLUMNS",
      "entryTrashInputSchema",
      "entryUpdateInputSchema",
      "settingsGetInputSchema",
      "settingsUpsertInputSchema",
      "termCreateInputSchema",
      "termDeleteInputSchema",
      "termGetInputSchema",
      "termListInputSchema",
      "termUpdateInputSchema",
      "userDeleteInputSchema",
      "userDisableInputSchema",
      "userGetInputSchema",
      "userInviteInputSchema",
      "userListInputSchema",
      "userUpdateInputSchema",
      "applyEntryBeforeSave",
      "fireEntryPublished",
      "fireEntryTransition",
      "fireEntryTrashed",
      "fireEntryUpdated",
      "emailField",
      "nameField",
      "RPC_ERRORS",
      "sweepAllUnsettledMeta",
      "sweepUnsettledMeta",
    ],
  },
  {
    reason:
      "the sign-in flows' own machinery — ceremonies, session and token " +
      "primitives, CSRF and redirect checks, capability resolution. A " +
      "site configures them through `auth()`; a runtime composes an " +
      "authenticator from the cookie and identity helpers that stay.",
    names: [
      "mintSessionAndCookie",
      "sessionCookieScope",
      "announceSignIn",
      "createSession",
      "validateSession",
      "invalidateSession",
      "invalidateAllSessionsForUser",
      "pruneExpiredSessions",
      "readClientMeta",
      "DEFAULT_SESSION_POLICY",
      "generateToken",
      "hashToken",
      "safeEqual",
      "beginAuthentication",
      "finishAuthentication",
      "ensureUint8Array",
      "beginRegistration",
      "finishRegistration",
      "persistCredential",
      "issueChallenge",
      "consumeChallenge",
      "pruneExpiredAuthTokens",
      "resolvePasskeyConfig",
      "resolvePasskeyOrigins",
      "PASSKEY_DEFAULTS",
      "PASSKEY_ERROR_CODES",
      "PasskeyError",
      "handleMagicLinkRequest",
      "handleMagicLinkVerify",
      "MAGIC_LINK_ERROR_CODES",
      "MagicLinkError",
      "handleOAuthStart",
      "handleOAuthCallback",
      "requestEmailChange",
      "verifyEmailChange",
      "cancelEmailChange",
      "EMAIL_CHANGE_ERROR_CODES",
      "EmailChangeError",
      "provisionUser",
      "authenticateTraced",
      "authenticateSession",
      "tokenScopesOf",
      "apiTokenOf",
      "requestHasSession",
      "isSafeMethod",
      "hasCsrfHeader",
      "isLoopbackHostname",
      "isLoopbackOrigin",
      "hasMatchingOrigin",
      "requireCsrf",
      "requireMatchingOrigin",
      "CsrfError",
      "buildSessionDeletionCookie",
      "extractDomain",
      "isSafeRedirect",
      "resolveRedirectTo",
      "optionalRedirectTo",
      "resolveLoginPath",
      "createCapabilityResolver",
      "getCapabilityResolver",
      "deriveEntryTypeCapabilities",
      "deriveTermTaxonomyCapabilities",
      "capabilitiesForRole",
    ],
  },
  {
    reason:
      "the ambient stores and the plumbing around them. A hook handler is " +
      "handed its context (#2310).",
    names: [
      "hookStore",
      "pluginStore",
      "traceStore",
      "txStore",
      "getContext",
      "withUser",
      "consoleLogger",
      "NOOP_HANDLE",
      "NOOP_TELEMETRY",
    ],
  },
  {
    reason:
      "the contract between core and its own tooling — the Vite plugin, " +
      "the CLI, the admin shell, the dispatcher and the Playwright editor " +
      "fixture read these from `@plumix/core` directly.",
    names: [
      "pluginCatalogUrl",
      "pluginCatalogStagedPath",
      "ADMIN_SHIPPED_CATALOGS_FILE",
      "projectCatalogLocales",
      "collectContributedBlocks",
      "byPriorityThen",
      "seedFromMetaBoxes",
      "deriveAdminSlug",
      "entryTypeCapability",
      "termTaxonomyCapability",
      "serializeManifestScript",
      "injectManifestIntoHtml",
      "readManifestScript",
      "CORE_NAV_GROUPS",
      "MANIFEST_SCRIPT_ID",
      "configuredSlotsOf",
      "CORE_SCHEMA_MODULE",
      "createPluginSetupContext",
      "createPluginAfterSetupContext",
      "createPluginProvidesContext",
      "assertValidPluginId",
      "PLUGIN_ID_RE",
      "MAX_PLUGIN_ID_LENGTH",
      "SITE_SETTINGS_DESCRIPTORS",
      "GENERIC_ENTRY_TYPE_LABELS",
      "GENERIC_TERM_TAXONOMY_LABELS",
      "buildLocaleCookie",
      "resolveLocales",
      "resolveLocale",
      "createPlumixDispatcher",
      "collectNamedTemplates",
      "NAMED_TEMPLATE_META_KEY",
      "templateRules",
      "interfaceEnabled",
    ],
  },
  {
    reason:
      "which entry types a listing page lists and is cache-tagged under, " +
      "and which types a user change can touch — rules the dispatcher, " +
      "the listing resolvers and the CDN purge invalidator share, so " +
      "stored and purged tags cannot drift (#2391, #2400)",
    names: [
      "listedEntryTypeNames",
      "termPageEntryTypeNames",
      "publicEntryTypeNames",
    ],
  },
  {
    reason:
      "the stored-meta pipeline's temporal coercion, which core's RPC and " +
      "the admin's meta-box field read directly",
    names: [
      "anchorTemporalUtc",
      "formatTemporalValue",
      "isTemporalInputType",
      "isValidTemporalValue",
    ],
  },
];

const CURATED: Readonly<Record<string, Curated>> = {
  ".": { draws: "@plumix/core" },
  "./plugin": { draws: "@plumix/core", adds: ["v"] },
  "./theme": { draws: "@plumix/core" },
  "./runtime": { draws: "@plumix/core" },
  "./auth": { draws: "@plumix/core" },
  "./support": {
    mirrors: "@plumix/core/support",
    withheld: [
      {
        reason:
          "the navigation transition types, published on `plumix/theme`. " +
          "The admin reads them here, clear of the root barrel.",
        names: ["viewTransitionTypes"],
        publishedBy: "./theme",
      },
    ],
  },
  "./cli": {
    mirrors: "@plumix/core/cli",
    withheld: [
      {
        reason: "the schedule helpers, published on `plumix/runtime`",
        names: [
          "CronSyntaxError",
          "parseCron",
          "declaredSchedules",
          "scheduledTasksFor",
        ],
        publishedBy: "./runtime",
      },
      {
        reason:
          "schema-codegen and migration-history helpers, " +
          "whose consumers are " +
          "this package's own `migrate` command and plugin tests through " +
          "`plumix/test`",
        names: [
          "CORE_SCHEMA_MODULE",
          "generateSchemaSource",
          "CORE_MIGRATIONS_FOLDER",
        ],
      },
      {
        reason:
          "core's own data migrations, which only `plumix`'s migrate runner reads",
        names: ["CORE_DATA_MIGRATIONS"],
      },
      {
        reason:
          "which tables each core sync scope holds, which only `plumix`'s " +
          "sync command and core's sync contract read",
        names: ["CORE_SYNC_SCOPE_TABLES", "SYNC_AUTH_TABLES"],
      },
      {
        reason:
          "the lines `sync_migrations_differ` lists; a transport calls " +
          "`assertSameHeads`, which throws with them",
        names: ["headDifferences"],
      },
      {
        reason:
          "how `--scope` names resolve to tables, which only this package's " +
          "sync and import commands and core's sync routes read",
        names: ["resolveScopes"],
      },
      {
        reason:
          "a scheduled task's budget and how a report names it, which only " +
          "this package's `cron` command reads",
        names: ["formatTimeout", "scheduledTaskTimeoutMs"],
      },
    ],
  },
  "./admin": {
    mirrors: "@plumix/core/admin",
    withheld: [
      {
        reason:
          "the runtime-key half of the shim roster, which admin's runtime " +
          "object and `PlumixAdminRuntime` are typed against. A plugin " +
          "chunk reads those keys through `getRuntime`, not this map.",
        names: ["SHARED_ADMIN_RUNTIME_KEYS"],
      },
      {
        reason:
          "the editing-copy controller and the save queue it writes through, " +
          "which only the admin's own editors use until a plugin editor moves " +
          "onto them (#3241)",
        names: ["createEditingCopy", "createSaveQueue", "LOADING_EDITING_COPY"],
      },
    ],
  },
  "./blocks": {
    mirrors: "@plumix/core/blocks",
    withheld: [
      {
        reason: "the JSON narrowings, published on `plumix/support`",
        names: ["isJsonArray", "isJsonObject"],
        publishedBy: "./support",
      },
      {
        reason:
          "the core block specs, which reach a site through `coreBlocks` " +
          "rather than one at a time",
        names: [
          "buttonBlock",
          "codeBlock",
          "columnBlock",
          "columnsBlock",
          "detailsBlock",
          "embedBlock",
          "groupBlock",
          "htmlBlock",
          "sectionBlock",
          "separatorBlock",
          "tableBlock",
          "tableBodyRowBlock",
          "tableCellBlock",
          "tableHeaderCellBlock",
          "tableHeaderRowBlock",
          "videoBlock",
        ],
      },
      {
        reason:
          "block machinery the renderer, the editor and core use internally. " +
          "A block author works through `defineBlock` and the render " +
          "primitives.",
        names: [
          "CORE_BLOCK_NAMESPACE",
          "isReservedBlockName",
          "DEFAULT_BLOCK_CONTEXT",
          "createMessageResolver",
          "resolveMessage",
          "editAppender",
          "freshBlockId",
          "rewriteBlockNodeIds",
          "countProse",
          "BlockLoaderError",
          "collectLoaderEntries",
          "resolveBlockLoaders",
          "resolveVariationPreview",
          "block",
          "definePattern",
          "resolveActiveVariation",
          "commitBlockVariations",
          "BlockVariationError",
          "resolveBlockScopeVariations",
          "DEFAULT_BREAKPOINTS",
          "emitBlockStyleCss",
          "VIEWPORT_MAX_PX",
          "createStyleFields",
          "styleCategoryForProperty",
          "allowsCustomStyles",
          "forbiddenStyles",
          "resolveStylePolicy",
          "STYLE_KEYWORDS",
          "sanitizeCssValue",
          "parseLoaderData",
          "serializeLoaderData",
          "parseRenderEnv",
          "collectBlockDepKeys",
          "pickDeps",
          "findBlockNode",
          "isContentInput",
          "isAllowedHtmlAttr",
          "safeHtmlAttrs",
          "ROOT_TAGS",
          "resolveRootTag",
          "BASELINE_HTML_ALLOWLIST",
          "sanitizeHtml",
          "buildHtmlAllowlist",
          "HtmlAllowlistProvider",
          "useHtmlAllowlist",
          "HEADING_LEVELS",
          "HEADING_TAGS",
          "unknownBlockSchema",
          "coreMarkExtensions",
          "expandShortcodes",
          "defineShortcode",
          "InsideIslandContext",
        ],
      },
    ],
  },
  "./blocks/renderer": {
    mirrors: "@plumix/core/blocks/renderer",
    withheld: [
      {
        reason:
          "the editor bridge protocol, spoken only between the canvas and " +
          "`@plumix/admin-editor`",
        names: [
          "createHandshake",
          "encode",
          "isHandshakeFrame",
          "parseEnvelope",
          "EDITOR_BRIDGE_CHANNEL",
        ],
      },
      {
        reason:
          "the boundary-less tree render the editor canvas mounts inside the " +
          "content root `BlockRenderer` already emitted; a theme renders " +
          "content through `BlockRenderer`",
        names: ["BlockTree"],
      },
    ],
  },
  "./auth/client": {
    mirrors: "@plumix/core/auth/client",
    withheld: [
      {
        reason:
          "the admin's own context seed: the admin is no server render, so " +
          "it hands `authClient` its base path itself",
        names: ["seedAuthContext"],
      },
    ],
  },
  "./blocks/island-renderer": {
    mirrors: "@plumix/core/blocks/island-renderer",
    withheld: [
      {
        reason:
          "the renderer's own root and slot decisions, exported for core's " +
          "unit tests; a site mounts islands only through `mount`",
        names: ["islandRootKind", "mergeSlotProps"],
      },
    ],
  },
  // Whole by value, not by `export *`: `Db` is typed over every key of core's
  // schema module, so a client built from this subpath needs each one.
  "./schema": { mirrors: "@plumix/core/schema", withheld: [] },
  "./db": {
    mirrors: "@plumix/core/db",
    withheld: [
      {
        reason:
          "drizzle's Postgres-only operators — array containment, `ilike` " +
          "and the pgvector distances. `ctx.db` is SQLite.",
        names: [
          "arrayContained",
          "arrayContains",
          "arrayOverlaps",
          "ilike",
          "notIlike",
          "cosineDistance",
          "hammingDistance",
          "innerProduct",
          "jaccardDistance",
          "l1Distance",
          "l2Distance",
        ],
      },
      {
        reason:
          "the pieces drizzle's `sql` template is assembled from, and its " +
          "driver codecs. A query composes them through `sql` and its " +
          "`sql.placeholder` / `sql.param` / `sql.identifier` helpers.",
        names: [
          "FakePrimitiveParam",
          "Name",
          "Param",
          "Placeholder",
          "StringChunk",
          "View",
          "bindIfParam",
          "fillPlaceholders",
          "getViewName",
          "isDriverValueEncoder",
          "isSQLWrapper",
          "isView",
          "name",
          "noopDecoder",
          "noopEncoder",
          "noopMapper",
          "param",
          "placeholder",
        ],
      },
    ],
  },
  "./db/libsql": { mirrors: "@plumix/core/db/libsql", withheld: [] },
  "./cdn/cloudflare": {
    mirrors: "@plumix/core/cdn/cloudflare",
    withheld: [],
  },
  "./storage/s3": { mirrors: "@plumix/core/storage/s3", withheld: [] },
  "./fields": { mirrors: "@plumix/core/fields", withheld: [] },
  // The one test import: core's harnesses and factories, and blocks' render
  // helpers beside them.
  "./test": {
    mirrors: ["@plumix/core/test", "@plumix/core/blocks/test"],
    withheld: [
      {
        reason:
          "the prefix-parameterized RPC stub and its responder error, which " +
          "a plugin reaches as `stubPluginRpc` and `PluginRpcError` on this " +
          "subpath, served at its own namespace",
        names: ["stubRpcEndpoint", "RpcReplyError"],
      },
      {
        reason:
          "the request memo for hand-rolled `AppContext` stand-ins that " +
          "predate `createTestContext`, which a new test takes instead",
        names: ["createRequestMemo"],
      },
      {
        reason:
          "`validateEntryContent` under a second name; it is published on " +
          "`plumix/blocks` under its own",
        names: ["validateContent"],
      },
      {
        reason:
          "the in-memory dump and two-site fixture behind core's and this " +
          "package's own sync tests; a runtime runs `describeSyncContract` " +
          "with ends of its own",
        names: ["memoryDump", "memorySyncEnds"],
      },
    ],
  },
  "./test/conformance": {
    mirrors: "@plumix/core/test/conformance",
    withheld: [],
  },
  "./test/playwright": {
    mirrors: "@plumix/core/test/playwright",
    withheld: [
      {
        reason:
          "this repo's own e2e plumbing — the port offset its suites share " +
          "under a parallel `turbo run test:e2e`, and a chunk build that " +
          "resolves shims out of plumix's source tree (`plumixAdminSrc`)",
        names: ["resolveE2EPort", "buildAdminPluginChunkForE2E"],
      },
    ],
  },
  "./core/dev-client": {
    mirrors: "@plumix/core/dev-client",
    withheld: [
      {
        reason:
          "endpoint paths shared by core's dev client and the Vite plugin, " +
          "which reads them from `@plumix/core/dev-client` itself",
        names: [
          "DEV_ERROR_CLIENT_ERRORS_ENDPOINT",
          "DEV_ERROR_SOURCE_ENDPOINT",
          "DEV_ERROR_STACK_ENDPOINT",
          "DEV_ERROR_TERMINAL_ENDPOINT",
        ],
      },
      {
        reason:
          "the pieces `installDevClient` installs, split out so core's unit " +
          "test can read them; a site only ever calls `installDevClient`",
        names: ["devClientParts"],
      },
    ],
  },
  "./i18n": {
    mirrors: "@plumix/core/i18n",
    withheld: [
      {
        reason:
          "locale resolution and the admin's label rosters, which the admin " +
          "imports from `@plumix/core/i18n` directly",
        names: [
          "buildLocaleCookie",
          "GENERIC_ENTRY_TYPE_LABELS",
          "GENERIC_TERM_TAXONOMY_LABELS",
          "SITE_SETTINGS_DESCRIPTORS",
          "resolveLocales",
          "resolveLocale",
        ],
      },
    ],
  },
  // The Lingui config a plugin's `lingui.config.ts` compiles its catalogs
  // with, kept off `./i18n`, which the browser and server load.
  "./lingui": { mirrors: "@plumix/core/lingui", withheld: [] },
  "./editor-runtime": {
    mirrors: "@plumix/admin-editor",
    withheld: [
      {
        reason:
          "the editor's React surface and its command roster, which the " +
          "admin imports from `@plumix/admin-editor` directly; the canvas " +
          "boots through `bootEditor` alone",
        names: ["PlumixEditor", "EDITOR_COMMAND_DESCRIPTORS"],
      },
    ],
  },
};

/**
 * Republished whole on purpose; each says why no name-by-name decision is
 * needed.
 */
const PASSTHROUGH: Readonly<Record<string, string>> = {
  "./admin/ui":
    "the vendored shadcn set, published as the admin shell renders it; the " +
    "entry documents that it carries no stability promise beyond pre-1.0",
};

/** Named, so a subpath is never skipped without a reason. */
const UNLOADABLE: Unloadable = {
  "@plumix/core/blocks/island-runtime":
    "registers the `<plumix-island>` custom element as it evaluates, and " +
    "the unit tier runs in Node with no `HTMLElement` to extend",
  "plumix/blocks/island-runtime":
    "imports `@plumix/core/blocks/island-runtime` for its side effect and " +
    "publishes nothing",
};

const { facade, sources } = await loadModules(UNLOADABLE);

function loaded(
  modules: ReadonlyMap<string, Namespace>,
  key: string,
): Namespace {
  const module = modules.get(key);
  if (module === undefined)
    throw new Error(`${key} is in no exports map, or is UNLOADABLE`);
  return module;
}

/**
 * Only a function or an object has an identity to trace back to a source;
 * a primitive would match any constant that happens to share its value.
 */
function hasIdentity(value: unknown): value is object {
  return (
    typeof value === "function" || (typeof value === "object" && value !== null)
  );
}

/**
 * Every internal module that exports a value, keyed by the value itself. A
 * namespace counts as its own module's, so republishing one whole is caught.
 */
const owners = new Map<object, string[]>();
for (const [specifier, module] of sources) {
  for (const value of [module, ...Object.values(module)]) {
    if (!hasIdentity(value)) continue;
    const found = owners.get(value) ?? [];
    if (!found.includes(specifier)) found.push(specifier);
    owners.set(value, found);
  }
}

interface Republished {
  readonly name: string;
  readonly value: object;
  readonly owners: string;
}

function republished(module: Namespace): Republished[] {
  return Object.entries(module).flatMap(([name, value]: [string, unknown]) => {
    if (!hasIdentity(value)) return [];
    const found = owners.get(value);
    return found === undefined
      ? []
      : [{ name, value, owners: found.join(" and ") }];
  });
}

// An entry without a row could republish internal values unreviewed through
// an import-then-export, a namespace or `export *`.
test("every subpath that republishes an internal value has a row", () => {
  expect(
    [...facade].flatMap(([subpath, module]) =>
      subpath in CURATED || subpath in PASSTHROUGH
        ? []
        : republished(module).map(
            ({ name, owners: from }) =>
              `${facadeSpecifier(subpath)} publishes "${name}", which is ` +
              `${from}'s — publish it from the subpath that owns it, or ` +
              `give ${subpath} a CURATED row`,
          ),
    ),
  ).toEqual([]);
});

test("every row names a façade subpath", () => {
  expect(
    [...Object.keys(CURATED), ...Object.keys(PASSTHROUGH)]
      .filter((subpath) => !facade.has(subpath))
      .map(
        (subpath) =>
          `${subpath} has a row but is not in plumix's exports map — ` +
          `drop the row`,
      ),
  ).toEqual([]);
});

describe.each(Object.entries(CURATED))(
  "the %s façade subpath",
  (subpath, entry) => {
    const specifier = facadeSpecifier(subpath);
    const module = loaded(facade, subpath);
    const published = Object.keys(module);

    if ("draws" in entry) {
      const barrel = loaded(sources, entry.draws);
      test(`publishes nothing ${entry.draws}'s barrel does not export`, () => {
        const adds = entry.adds ?? [];
        expect([
          ...published
            .filter(
              (name) => !adds.includes(name) && barrel[name] !== module[name],
            )
            .map(
              (name) =>
                `${specifier} publishes "${name}", which ${entry.draws}'s ` +
                `barrel does not export — publish it from the subpath that ` +
                `owns it, or list it in ${subpath}'s adds`,
            ),
          ...adds
            .filter((name) => !published.includes(name))
            .map(
              (name) =>
                `${subpath} adds "${name}", which ${specifier} does not ` +
                `publish — drop it from adds`,
            ),
        ]).toEqual([]);
      });
      return;
    }

    const mirrored =
      typeof entry.mirrors === "string" ? [entry.mirrors] : entry.mirrors;
    const mirrors = mirrored.join(" and ");
    const source: Namespace = Object.fromEntries(
      mirrored.flatMap((from) => Object.entries(loaded(sources, from))),
    );
    const withheld = entry.withheld.flatMap((group) => group.names);

    test("publishes or withholds every value its source exports", () => {
      expect(
        Object.keys(source)
          .filter(
            (name) => !published.includes(name) && !withheld.includes(name),
          )
          .map(
            (name) =>
              `${specifier} neither publishes nor withholds "${name}", ` +
              `which ${mirrors} exports — publish it, or withhold it ` +
              `with a reason in ${subpath}'s row`,
          ),
      ).toEqual([]);
    });

    test("publishes no internal value from outside its source", () => {
      const own = new Set(Object.values(source));
      expect(
        republished(module)
          .filter(({ value }) => !own.has(value))
          .map(
            ({ name, owners: from }) =>
              `${specifier} publishes "${name}", which is ${from}'s, not ` +
              `${mirrors}'s — publish it from the subpath that owns ` +
              `it`,
          ),
      ).toEqual([]);
    });

    test("publishes nothing it withholds", () => {
      expect(
        withheld
          .filter((name) => published.includes(name))
          .map(
            (name) =>
              `${specifier} publishes "${name}", which its row withholds — ` +
              `stop publishing it, or drop the withholding`,
          ),
      ).toEqual([]);
    });

    test("withholds nothing its source no longer exports", () => {
      expect(
        withheld
          .filter((name) => !(name in source))
          .map(
            (name) =>
              `${subpath} withholds "${name}", which ${mirrors} no ` +
              `longer exports — drop it from the row`,
          ),
      ).toEqual([]);
    });

    test("withholds a name for another subpath only where that subpath publishes it", () => {
      expect(
        entry.withheld.flatMap(({ names, publishedBy }) =>
          publishedBy === undefined
            ? []
            : names
                .filter((name) => !(name in loaded(facade, publishedBy)))
                .map(
                  (name) =>
                    `${subpath} withholds "${name}" for ` +
                    `${facadeSpecifier(publishedBy)}, which does not ` +
                    `publish it — publish it there, or drop publishedBy`,
                ),
        ),
      ).toEqual([]);
    });
  },
);

/**
 * A value under two subpaths leaves auto-import to pick between them.
 * Compared by identity; primitives have none, so they collide only by name.
 */
const publications = Object.keys(CURATED).flatMap((subpath) =>
  Object.entries(loaded(facade, subpath)).map(
    ([name, value]: [string, unknown]) => ({ subpath, name, value }),
  ),
);

test("no value is published by two subpaths", () => {
  expect(
    publications.flatMap((a, index) =>
      publications
        .slice(index + 1)
        .filter(
          (b) =>
            b.value === a.value &&
            (b.name === a.name ||
              (b.subpath !== a.subpath && hasIdentity(a.value))),
        )
        .map(
          (b) =>
            `"${a.name}" is published by ${facadeSpecifier(a.subpath)} and ` +
            `${facadeSpecifier(b.subpath)} — publish it from one and ` +
            `withhold it on the other`,
        ),
    ),
  ).toEqual([]);
});

// A plugin asks for page data through the call core's own route makes.
test("plumix/plugin offers core's page-data resolvers, not the row assembler", () => {
  const plugin = loaded(facade, "./plugin");
  expect(
    ["resolveEntryData", "resolveEntryList", "resolveListingPage"].filter(
      (name) => !(name in plugin),
    ),
  ).toEqual([]);
  expect("buildResolvedEntries" in plugin).toBe(false);
});

// ADR 0025: a page kind is named by its subject, and a theme's generic tier
// builders and guards are spelled with it.
test("plumix/theme names its tier builders and guards by page kind", () => {
  const theme = loaded(facade, "./theme");
  expect(
    ["entryType", "term", "isEntryType", "isTerm", "isArchiveType"].filter(
      (name) => !(name in theme),
    ),
  ).toEqual([]);
  expect(
    ["archive", "taxonomy", "isArchive", "isTaxonomy", "isCustom"].filter(
      (name) => name in theme,
    ),
  ).toEqual([]);
});

describe("core's barrel", () => {
  const withheld = CORE_WITHHELD.flatMap((group) => group.names);
  const core = loaded(sources, "@plumix/core");

  test("every value it exports is published or withheld", () => {
    expect(
      Object.entries(core)
        .filter(
          ([name, value]: [string, unknown]) =>
            !withheld.includes(name) &&
            !publications.some((p) => p.name === name && p.value === value),
        )
        .map(
          ([name]) =>
            `@plumix/core exports "${name}", which no subpath publishes — ` +
            `publish it from the subpath whose role it serves, or add it to ` +
            `CORE_WITHHELD with a reason`,
        ),
    ).toEqual([]);
  });

  test("nothing it withholds is published", () => {
    expect(
      publications
        .filter((p) => withheld.includes(p.name))
        .map(
          (p) =>
            `${facadeSpecifier(p.subpath)} publishes "${p.name}", which ` +
            `CORE_WITHHELD withholds — stop publishing it, or drop the ` +
            `withholding`,
        ),
    ).toEqual([]);
  });

  test("it withholds nothing it no longer exports", () => {
    expect(
      withheld
        .filter((name) => !(name in core))
        .map(
          (name) =>
            `CORE_WITHHELD withholds "${name}", which @plumix/core no ` +
            `longer exports — drop it`,
        ),
    ).toEqual([]);
  });
});
