import { existsSync, readFileSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, test } from "vitest";

import * as adminEditor from "@plumix/admin-editor";
import * as blocksPackage from "@plumix/blocks";
import * as blocksIslandRendererPackage from "@plumix/blocks/island-renderer";
import * as blocksRendererPackage from "@plumix/blocks/renderer";
import * as blocksTestPackage from "@plumix/blocks/test";
import * as core from "@plumix/core";
import * as coreAdmin from "@plumix/core/admin";
import * as coreCdnCloudflare from "@plumix/core/cdn/cloudflare";
import * as coreCli from "@plumix/core/cli";
import * as coreDb from "@plumix/core/db";
import * as coreDbLibsql from "@plumix/core/db/libsql";
import * as coreDevClient from "@plumix/core/dev-client";
import * as coreFields from "@plumix/core/fields";
import * as coreI18n from "@plumix/core/i18n";
import * as coreSchema from "@plumix/core/schema";
import * as coreStorageS3 from "@plumix/core/storage/s3";
import * as coreSupport from "@plumix/core/support";
import * as coreTest from "@plumix/core/test";
import * as coreTestConformance from "@plumix/core/test/conformance";
import * as coreTestPlaywright from "@plumix/core/test/playwright";

import * as admin from "./admin/index.js";
import * as auth from "./auth/index.js";
import * as blocks from "./blocks/index.js";
import * as blocksIslandRenderer from "./blocks/island-renderer.js";
import * as blocksRenderer from "./blocks/renderer.js";
import * as blocksTest from "./blocks/test.js";
import * as cdnCloudflare from "./cdn/cloudflare.js";
import * as cli from "./cli/kit.js";
import * as devClient from "./core/dev-client.js";
import * as db from "./db/index.js";
import * as dbLibsql from "./db/libsql.js";
import * as editorRuntime from "./editor-runtime.js";
import * as fields from "./fields/index.js";
import * as i18n from "./i18n/index.js";
import * as root from "./index.js";
import * as plugin from "./plugin.js";
import * as runtime from "./runtime/index.js";
import * as schema from "./schema/index.js";
import * as storageS3 from "./storage/s3.js";
import * as support from "./support/index.js";
import * as testConformance from "./test/conformance.js";
import * as testSubpath from "./test/index.js";
import * as testPlaywright from "./test/playwright.js";
import * as theme from "./theme/index.js";

// A curated subpath names what it publishes, so the internal package behind it
// can grow without the façade noticing: a new export is simply not re-exported,
// and a documented one can sit unreachable for as long as nobody tries to
// import it. This guard makes every value export of the source a decision —
// published, or withheld with a reason — and fails on one nobody made. Values
// only; the root says why its types stay wholesale.

interface Withholding {
  readonly reason: string;
  readonly names: readonly string[];
  /** The subpath that publishes these instead, checked rather than claimed. */
  readonly publishedBy?: object;
}

type Curated =
  | {
      readonly module: object;
      readonly mirrors: object;
      readonly withheld: readonly Withholding[];
    }
  | {
      readonly module: object;
      /**
       * A role's cut of core's barrel: every value it publishes is one the
       * barrel exports, plus names only this subpath adds.
       */
      readonly draws: object;
      readonly adds?: readonly string[];
    };

// The values core's barrel exports that no subpath publishes. Every other one
// is published by exactly one subpath, which the tests below check by identity.
const CORE_WITHHELD: readonly Withholding[] = [
  {
    reason:
      "core's own RPC surface — the admin client's routers, their input " +
      "schemas and the entry lifecycle they drive. A plugin builds its " +
      "router from `base`.",
    names: [
      "appRouter",
      "authRouter",
      "entryRouter",
      "metaRouter",
      "settingsRouter",
      "termRouter",
      "userRouter",
      "authSessionOutputSchema",
      "entryCreateInputSchema",
      "entryGetInputSchema",
      "entryListInputSchema",
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
      "entryCapability",
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
      "resolveSafeRedirect",
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
      "the CLI, the admin shell and the dispatcher read these from " +
      "`@plumix/core` directly.",
    names: [
      "pluginCatalogUrl",
      "pluginCatalogStagedPath",
      "collectContributedBlocks",
      "byPriorityThen",
      "seedFromMetaBoxes",
      "deriveAdminSlug",
      "serializeManifestScript",
      "injectManifestIntoHtml",
      "CORE_NAV_GROUPS",
      "MANIFEST_SCRIPT_ID",
      "collectRawSqlMigrations",
      "planRawSqlMigrations",
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
  ".": { module: root, draws: core },
  "./plugin": { module: plugin, draws: core, adds: ["v"] },
  "./theme": { module: theme, draws: core },
  "./runtime": { module: runtime, draws: core },
  "./auth": { module: auth, draws: core },
  "./support": { module: support, mirrors: coreSupport, withheld: [] },
  "./cli": {
    module: cli,
    mirrors: coreCli,
    withheld: [
      {
        reason: "the schedule helpers, published on `plumix/runtime`",
        names: [
          "CronSyntaxError",
          "parseCron",
          "declaredSchedules",
          "scheduledTasksFor",
        ],
        publishedBy: runtime,
      },
      {
        reason:
          "raw-migration and schema-codegen helpers, whose consumers are " +
          "this package's own `migrate` command and plugin tests through " +
          "`plumix/test`",
        names: [
          "collectRawSqlMigrations",
          "planRawSqlMigrations",
          "CORE_SCHEMA_MODULE",
          "generateSchemaSource",
        ],
      },
    ],
  },
  "./admin": { module: admin, mirrors: coreAdmin, withheld: [] },
  "./blocks": {
    module: blocks,
    mirrors: blocksPackage,
    withheld: [
      {
        reason: "the JSON narrowings, published on `plumix/support`",
        names: ["isJsonArray", "isJsonObject"],
        publishedBy: support,
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
          "sanitizeCssValue",
          "parseLoaderData",
          "serializeLoaderData",
          "findBlockNode",
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
    module: blocksRenderer,
    mirrors: blocksRendererPackage,
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
    ],
  },
  "./blocks/test": {
    module: blocksTest,
    mirrors: blocksTestPackage,
    withheld: [
      {
        reason:
          "`validateEntryContent` under a second name; it is published on " +
          "`plumix/blocks` under its own",
        names: ["validateContent"],
      },
    ],
  },
  "./blocks/island-renderer": {
    module: blocksIslandRenderer,
    mirrors: blocksIslandRendererPackage,
    withheld: [],
  },
  // Whole by value, not by `export *`: `Db` is typed over every key of core's
  // schema module, so a client built from this subpath needs each one.
  "./schema": { module: schema, mirrors: coreSchema, withheld: [] },
  "./db": {
    module: db,
    mirrors: coreDb,
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
  "./db/libsql": { module: dbLibsql, mirrors: coreDbLibsql, withheld: [] },
  "./cdn/cloudflare": {
    module: cdnCloudflare,
    mirrors: coreCdnCloudflare,
    withheld: [],
  },
  "./storage/s3": { module: storageS3, mirrors: coreStorageS3, withheld: [] },
  "./fields": { module: fields, mirrors: coreFields, withheld: [] },
  "./test": {
    module: testSubpath,
    mirrors: coreTest,
    withheld: [
      {
        reason:
          "the request memo for hand-rolled `AppContext` stand-ins that " +
          "predate `createTestContext`, which a new test takes instead",
        names: ["createRequestMemo"],
      },
    ],
  },
  "./test/conformance": {
    module: testConformance,
    mirrors: coreTestConformance,
    withheld: [],
  },
  "./test/playwright": {
    module: testPlaywright,
    mirrors: coreTestPlaywright,
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
    module: devClient,
    mirrors: coreDevClient,
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
    ],
  },
  "./i18n": {
    module: i18n,
    mirrors: coreI18n,
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
  "./editor-runtime": {
    module: editorRuntime,
    mirrors: adminEditor,
    withheld: [
      {
        reason:
          "the editor's React surface, which the admin mounts from " +
          "`@plumix/admin-editor` directly; the canvas boots through " +
          "`bootEditor` alone",
        names: [
          "connectCanvas",
          "connectRuntime",
          "EditorCanvas",
          "CanvasFrame",
          "EditorConfigProvider",
          "useEditorConfig",
          "PlumixEditor",
          "EDITOR_COMMAND_DESCRIPTORS",
          "EditorProvider",
          "useEditorStore",
          "createEditorStore",
          "MAX_ZOOM",
          "MIN_ZOOM",
        ],
      },
    ],
  },
};

describe.each(Object.entries(CURATED))("the %s façade subpath", (_, entry) => {
  const published = Object.keys(entry.module);

  if ("draws" in entry) {
    test("publishes nothing core's barrel does not export", () => {
      const adds = entry.adds ?? [];
      const source = new Map(Object.entries(entry.draws));
      const module = new Map(Object.entries(entry.module));
      expect(
        published.filter(
          (name) =>
            !adds.includes(name) && source.get(name) !== module.get(name),
        ),
      ).toEqual([]);
      expect(adds.filter((name) => !published.includes(name))).toEqual([]);
    });
    return;
  }

  const withheld = entry.withheld.flatMap((group) => group.names);

  test("publishes or withholds every value its source exports", () => {
    expect(
      Object.keys(entry.mirrors).filter(
        (name) => !published.includes(name) && !withheld.includes(name),
      ),
    ).toEqual([]);
  });

  test("publishes nothing it withholds", () => {
    expect(withheld.filter((name) => published.includes(name))).toEqual([]);
  });

  test("withholds nothing its source no longer exports", () => {
    expect(withheld.filter((name) => !(name in entry.mirrors))).toEqual([]);
  });

  test("withholds a name for another subpath only where that subpath publishes it", () => {
    expect(
      entry.withheld.flatMap(({ names, publishedBy }) =>
        publishedBy === undefined
          ? []
          : names.filter((name) => !(name in publishedBy)),
      ),
    ).toEqual([]);
  });
});

// One import path per value: a name reachable from two subpaths leaves an
// editor's auto-import to pick between them, and neither is wrong enough for a
// review to catch. Compared by identity, so `plumix/fields`'s `date` field and
// `plumix/theme`'s `date` tier builder are two values that share a spelling,
// while one function under two subpaths' names is still one value. A primitive has no
// identity to compare, so two constants only collide when their names do.
const publications = Object.entries(CURATED).flatMap(([subpath, entry]) =>
  Object.entries(entry.module).map(([name, value]: [string, unknown]) => ({
    subpath,
    name,
    value,
  })),
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
              (b.subpath !== a.subpath &&
                (typeof a.value === "function" ||
                  (typeof a.value === "object" && a.value !== null)))),
        )
        .map((b) => `${a.name}: ${a.subpath} and ${b.subpath}`),
    ),
  ).toEqual([]);
});

describe("core's barrel", () => {
  const withheld = CORE_WITHHELD.flatMap((group) => group.names);
  const exported: [string, unknown][] = Object.entries(core);

  test("every value it exports is published or withheld", () => {
    expect(
      exported
        .filter(
          ([name, value]) =>
            !withheld.includes(name) &&
            !publications.some((p) => p.name === name && p.value === value),
        )
        .map(([name]) => name),
    ).toEqual([]);
  });

  test("nothing it withholds is published", () => {
    expect(
      withheld.filter((name) => publications.some((p) => p.name === name)),
    ).toEqual([]);
  });

  test("it withholds nothing it no longer exports", () => {
    expect(withheld.filter((name) => !(name in core))).toEqual([]);
  });
});

// A subpath that republishes an internal package whole, on purpose. Anything
// that package exports is published `plumix` API the moment it lands, so each
// one says why nobody needs to decide name by name.
const PASSTHROUGH: Readonly<Record<string, string>> = {
  "./admin/ui":
    "the vendored shadcn set, published as the admin shell renders it; the " +
    "entry documents that it carries no stability promise beyond pre-1.0",
};

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"),
) as { exports: Record<string, { default: string }> };

function entryFile(subpath: string): string {
  const spec = pkg.exports[subpath];
  if (spec === undefined) throw new Error(`no ${subpath} in the exports map`);
  return resolve(
    import.meta.dirname,
    spec.default.replace(/^\.\/dist\//, "").replace(/\.js$/, ".ts"),
  );
}

const entrySources = Object.keys(pkg.exports).map(
  (subpath) => [subpath, readFileSync(entryFile(subpath), "utf8")] as const,
);

function subpathsMatching(pattern: RegExp): string[] {
  return entrySources
    .filter(([, source]) => pattern.test(source))
    .map(([subpath]) => subpath)
    .sort();
}

// A subpath curates when its entry re-exports named values from an internal
// package; every one of those needs a row above.
test("every curated subpath has a drift guard", () => {
  expect(Object.keys(CURATED).sort()).toEqual(
    subpathsMatching(/export\s+\{[^}]*\}\s+from\s+["']@plumix\//),
  );
});

// Types stay wholesale (`export type *`); a value `export *` is invisible to
// every row above, so it has to be a passthrough someone wrote down.
test("no subpath republishes an internal package wholesale unless it is a passthrough", () => {
  expect(
    subpathsMatching(/export\s+\*\s+(?:as\s+[\w$]+\s+)?from\s+["']@plumix\//),
  ).toEqual(Object.keys(PASSTHROUGH).sort());
});

// The types that have no role subpath, so the root is their only home. Every
// other type core's barrel exports sits on the root and on exactly one other
// subpath.
const ROOT_ONLY_TYPES: readonly Omit<Withholding, "publishedBy">[] = [
  {
    reason:
      'the augmentation targets. A `declare module "plumix"` block ' +
      "merges into the interface only through the specifier it names, " +
      "so a second path would split one registry into two views",
    names: [
      "ActionRegistry",
      "AppContextExtensions",
      "ArchiveTypeOptions",
      "ArchiveTypeRegistry",
      "DebugPanelRegistry",
      "EntryMetaContributions",
      "EntryTypeOptions",
      "EntryTypeRegistry",
      "FilterRegistry",
      "ImageRoles",
      "LookupAdapterOptions",
      "PluginContextExtensions",
      "PlumixEnv",
      "ReferenceHydrationShapes",
      "SettingsContributions",
      "TemplateDepRegistry",
      "TermMetaContributions",
      "TermTaxonomyOptions",
      "TermTaxonomyRegistry",
      "ThemeDescriptor",
      "UserMetaContributions",
    ],
  },
  {
    reason:
      "the root's own role: the site config's shape and what fills its " +
      "slots — the mailer, telemetry, locales and the dev request history",
    names: [
      "AnyDatabaseAdapter",
      "AnyPluginDescriptor",
      "ApiConfig",
      "ApiCorsConfig",
      "DebugBarInput",
      "DebugHistoryStore",
      "DebugHistoryStoreOptions",
      "DebugPanelsInput",
      "DebugSnapshot",
      "DevInput",
      "EmailMessage",
      "EnvInput",
      "I18nInput",
      "InterfaceToggle",
      "LocaleDirection",
      "LocaleInput",
      "LocaleResolverOverride",
      "Mailer",
      "MailerInput",
      "PlumixConfig",
      "PlumixConfigInput",
      "PlumixConfigIssue",
      "ResolvedI18n",
      "ResolvedLocale",
      "TelemetryCollector",
      "TelemetryConfig",
      "TelemetryConsumer",
      "TelemetryDropped",
      "TelemetryRecord",
      "TelemetryRequestEnvelope",
      "TelemetrySnapshot",
      "TelemetrySpan",
      "TelemetrySpanError",
      "TelemetrySpanHandle",
      "Theme",
      "ViteUserConfig",
    ],
  },
  {
    reason:
      "core's own RPC surface, whose routers and input schemas are " +
      "withheld; the admin client is typed through them",
    names: [
      "AppRouter",
      "AppRouterClient",
      "AuthRouter",
      "AuthSessionOutput",
      "AuthSessionUser",
      "EntryCreateInput",
      "EntryGetInput",
      "EntryListInput",
      "EntryRouter",
      "EntryTrashInput",
      "EntryUpdateInput",
      "SettingsGetInput",
      "SettingsRouter",
      "SettingsUpsertInput",
      "TermCreateInput",
      "TermDeleteInput",
      "TermGetInput",
      "TermListInput",
      "TermRouter",
      "TermUpdateInput",
      "UserDeleteInput",
      "UserDisableInput",
      "UserGetInput",
      "UserInviteInput",
      "UserListInput",
      "UserRouter",
      "UserUpdateInput",
    ],
  },
  {
    reason: "the ambient hook store's frame, withheld with the store",
    names: ["HookFrame"],
  },
];

// Workspace packages resolve to their source, as they do for vitest, so this
// reads what the tests run against and needs no build: a `dist/` declaration
// that exists or not, the builds are 1:1 (`src/**/*.ts` to `dist/**/*.d.ts`).
function sourcePath(path: string): string | undefined {
  const match = /^(.*?)\/dist(\/.*)?$/.exec(path);
  if (match?.[1] === undefined || !existsSync(match[1])) return undefined;
  const packageDir = realpathSync(match[1]);
  if (packageDir.includes("/node_modules/")) return undefined;
  return `${packageDir}/src${match[2] ?? ""}`;
}

function sourceOf(file: string): string | undefined {
  const stem = sourcePath(file)?.replace(/\.d\.ts$/, "");
  if (stem === undefined) return undefined;
  return [".ts", ".tsx"]
    .map((extension) => `${stem}${extension}`)
    .find((candidate) => existsSync(candidate));
}

function sourceResolver(
  options: ts.CompilerOptions,
  host: ts.ModuleResolutionHost,
): (
  specifier: string,
  containingFile: string,
) => ts.ResolvedModuleFull | undefined {
  const resolution: ts.ModuleResolutionHost = {
    ...host,
    fileExists: (file) => host.fileExists(file) || sourceOf(file) !== undefined,
    directoryExists: (directory) => {
      const source = sourcePath(directory);
      return (
        host.directoryExists?.(directory) === true ||
        (source !== undefined && existsSync(source))
      );
    },
  };
  return (specifier, containingFile) => {
    const resolved = ts.resolveModuleName(
      specifier,
      containingFile,
      options,
      resolution,
    ).resolvedModule;
    if (resolved === undefined) return undefined;
    const source = sourceOf(resolved.resolvedFileName);
    if (source === undefined) return resolved;
    return {
      ...resolved,
      resolvedFileName: source,
      extension: source.endsWith(".tsx") ? ts.Extension.Tsx : ts.Extension.Ts,
      isExternalLibraryImport: false,
    };
  };
}

// Types stay wholesale on the root because the declaration emitter needs them
// there. Printing a type a consumer's `.d.ts` inferred, it picks the specifier
// with the fewest path components: the root has none, and on a tie between
// `plumix/plugin` and `@plumix/core` it keeps the declaring package, which no
// consumer can resolve (#2347). A role subpath re-exports its own types on top,
// so a theme or a plugin file still needs one import. Values are compared at
// runtime above; types only exist for the compiler, so this asks it.
describe("types", () => {
  let coreTypes: Map<string, ts.Symbol>;
  let subpathTypes: Map<string, Map<string, ts.Symbol>>;

  // Parsing, not checking: the program reads the whole source graph behind
  // the façade, about 1,900 files, to follow its re-exports. That is ~3.5s
  // alone, and past the 10s default on a contended `test:unit` run.
  beforeAll(() => {
    const config = ts.getParsedCommandLineOfConfigFile(
      resolve(import.meta.dirname, "..", "tsconfig.json"),
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
    );
    if (config === undefined) throw new Error("tsconfig.json did not parse");
    const entries = new Map(
      Object.keys(CURATED).map((subpath) => [subpath, entryFile(subpath)]),
    );
    const host = ts.createCompilerHost(config.options);
    const resolveSource = sourceResolver(config.options, host);
    host.resolveModuleNameLiterals = (literals, containingFile) =>
      literals.map((literal) => ({
        resolvedModule: resolveSource(literal.text, containingFile),
      }));
    const program = ts.createProgram(
      [...entries.values()],
      config.options,
      host,
    );
    const checker = program.getTypeChecker();

    function typesOf(file: string): Map<string, ts.Symbol> {
      const source = program.getSourceFile(file);
      const module = source && checker.getSymbolAtLocation(source);
      const types = new Map<string, ts.Symbol>();
      for (const exported of module ? checker.getExportsOfModule(module) : []) {
        const target =
          exported.flags & ts.SymbolFlags.Alias
            ? checker.getAliasedSymbol(exported)
            : exported;
        if (!(target.flags & ts.SymbolFlags.Value)) {
          types.set(exported.name, target);
        }
      }
      return types;
    }

    const coreFile = resolveSource(
      "@plumix/core",
      entryFile("."),
    )?.resolvedFileName;
    if (coreFile === undefined) throw new Error("@plumix/core did not resolve");
    coreTypes = typesOf(coreFile);
    subpathTypes = new Map(
      [...entries].map(([subpath, file]) => [subpath, typesOf(file)]),
    );
  }, 30_000);

  const rootOnly = ROOT_ONLY_TYPES.flatMap((group) => group.names);

  function homesOf(name: string, symbol: ts.Symbol): string[] {
    return [...subpathTypes]
      .filter(
        ([subpath, types]) => subpath !== "." && types.get(name) === symbol,
      )
      .map(([subpath]) => subpath);
  }

  test("the root carries every type core's barrel exports", () => {
    const rootTypes = subpathTypes.get(".");
    expect(
      [...coreTypes]
        .filter(([name, symbol]) => rootTypes?.get(name) !== symbol)
        .map(([name]) => name),
    ).toEqual([]);
  });

  test("every other type has exactly one role subpath", () => {
    expect(
      [...coreTypes]
        .filter(([name]) => !rootOnly.includes(name))
        .map(([name, symbol]) => [name, homesOf(name, symbol)] as const)
        .filter(([, homes]) => homes.length !== 1)
        .map(([name, homes]) => `${name}: ${homes.join(", ") || "none"}`),
    ).toEqual([]);
  });

  test("a root-only type is a core type no other subpath publishes", () => {
    expect(
      rootOnly.filter((name) => {
        const symbol = coreTypes.get(name);
        return symbol === undefined || homesOf(name, symbol).length > 0;
      }),
    ).toEqual([]);
  });

  test("no type sits on two subpaths besides the root", () => {
    const seen = new Map<ts.Symbol, string>();
    const twice: string[] = [];
    for (const [subpath, types] of subpathTypes) {
      if (subpath === ".") continue;
      for (const [name, symbol] of types) {
        const first = seen.get(symbol);
        if (first === undefined) seen.set(symbol, subpath);
        else twice.push(`${name}: ${first} and ${subpath}`);
      }
    }
    expect(twice).toEqual([]);
  });
});
