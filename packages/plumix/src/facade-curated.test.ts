import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

import * as adminEditor from "@plumix/admin-editor";
import * as blocksPackage from "@plumix/blocks";
import * as blocksRendererPackage from "@plumix/blocks/renderer";
import * as blocksTestPackage from "@plumix/blocks/test";
import * as core from "@plumix/core";
import * as coreAdmin from "@plumix/core/admin";
import * as coreCli from "@plumix/core/cli";
import * as coreDevClient from "@plumix/core/dev-client";
import * as coreI18n from "@plumix/core/i18n";

import * as admin from "./admin/index.js";
import * as blocks from "./blocks/index.js";
import * as blocksRenderer from "./blocks/renderer.js";
import * as blocksTest from "./blocks/test.js";
import * as cli from "./cli/kit.js";
import * as devClient from "./core/dev-client.js";
import * as editorRuntime from "./editor-runtime.js";
import * as fields from "./fields/index.js";
import * as i18n from "./i18n/index.js";
import * as root from "./index.js";
import * as plugin from "./plugin.js";
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
      /** A subset of another façade subpath, plus names only this one adds. */
      readonly narrows: object;
      readonly adds?: readonly string[];
    };

const CURATED: Readonly<Record<string, Curated>> = {
  ".": {
    module: root,
    mirrors: core,
    withheld: [
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
          "manifestEntryVisibility",
          "pluginCatalogUrl",
          "pluginCatalogStagedPath",
          "emptyManifest",
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
          "generateSchemaSource",
          "createPluginSetupContext",
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
        reason: "published on `plumix/cli`",
        names: [
          "CliError",
          "isCliError",
          "spawnCapturingStderr",
          "spawnInherit",
        ],
        publishedBy: cli,
      },
      {
        reason: "published on `plumix/fields`",
        names: [
          "compileMetaBoxFields",
          "toMetaBoxFieldEntry",
          "isFieldVisible",
        ],
        publishedBy: fields,
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
      {
        reason: "published on `plumix/i18n`",
        names: ["withContext"],
        publishedBy: i18n,
      },
      {
        reason: "published on `plumix/blocks`",
        names: ["CSRF_HEADER_NAME", "CSRF_HEADER_VALUE"],
        publishedBy: blocks,
      },
      {
        reason: "published on `plumix/admin`",
        names: ["adminRuntimeShimSlug", "SHARED_ADMIN_RUNTIME_SPECIFIERS"],
        publishedBy: admin,
      },
    ],
  },
  "./plugin": { module: plugin, narrows: root, adds: ["v"] },
  "./theme": { module: theme, narrows: root },
  "./cli": {
    module: cli,
    mirrors: coreCli,
    withheld: [
      {
        reason: "the schedule helpers, which a runtime reads from the root",
        names: [
          "CronSyntaxError",
          "parseCron",
          "declaredSchedules",
          "scheduledTasksFor",
        ],
        publishedBy: root,
      },
      {
        reason:
          "raw-migration and schema-codegen helpers, whose only consumer is " +
          "this package's own `migrate` command",
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
        reason: "the JSON narrowings, published with their types",
        names: ["isJsonArray", "isJsonObject"],
        publishedBy: root,
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
    withheld: [],
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

  if ("narrows" in entry) {
    test("publishes nothing its wider subpath withholds", () => {
      const adds = entry.adds ?? [];
      expect(
        published.filter(
          (name) => !(name in entry.narrows) && !adds.includes(name),
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

// A subpath curates when its entry re-exports named values from an internal
// package; every one of those needs a row above.
test("every curated subpath has a drift guard", () => {
  const pkg = JSON.parse(
    readFileSync(resolve(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as { exports: Record<string, { default: string }> };
  const namedValueReexport = /export\s+\{[^}]*\}\s+from\s+["']@plumix\//;
  const curating = Object.entries(pkg.exports).flatMap(([subpath, spec]) => {
    const src = resolve(
      import.meta.dirname,
      spec.default.replace(/^\.\/dist\//, "").replace(/\.js$/, ".ts"),
    );
    return namedValueReexport.test(readFileSync(src, "utf8")) ? [subpath] : [];
  });
  expect(Object.keys(CURATED).sort()).toEqual(curating.sort());
});
