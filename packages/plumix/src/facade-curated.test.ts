import { describe, expect, test } from "vitest";

import type { Namespace, Unloadable } from "../test/facade-entries.js";
import { facadeSpecifier, loadModules } from "../test/facade-entries.js";

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
  readonly publishedBy?: string;
}

// A row records decisions only. Its source is named by specifier and the entry
// by subpath; the guard loads both from the exports maps.
type Curated =
  | {
      readonly mirrors: string;
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

// The values core's barrel exports that no subpath publishes. Every other one
// is published by exactly one subpath, which the tests below check by identity.
const CORE_WITHHELD: readonly Withholding[] = [
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
  ".": { draws: "@plumix/core" },
  "./plugin": { draws: "@plumix/core", adds: ["v"] },
  "./theme": { draws: "@plumix/core" },
  "./runtime": { draws: "@plumix/core" },
  "./auth": { draws: "@plumix/core" },
  "./support": { mirrors: "@plumix/core/support", withheld: [] },
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
    ],
  },
  "./blocks": {
    mirrors: "@plumix/blocks",
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
    mirrors: "@plumix/blocks/renderer",
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
    mirrors: "@plumix/blocks/test",
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
    mirrors: "@plumix/blocks/island-renderer",
    withheld: [],
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
  "./test": {
    mirrors: "@plumix/core/test",
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
  "./editor-runtime": {
    mirrors: "@plumix/admin-editor",
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

// A subpath that republishes an internal package whole, on purpose. Anything
// that package exports is published `plumix` API the moment it lands, so each
// one says why nobody needs to decide name by name.
const PASSTHROUGH: Readonly<Record<string, string>> = {
  "./admin/ui":
    "the vendored shadcn set, published as the admin shell renders it; the " +
    "entry documents that it carries no stability promise beyond pre-1.0",
};

// Named, so a subpath is never skipped without a reason.
const UNLOADABLE: Unloadable = {
  "@plumix/blocks/island-runtime":
    "registers the `<plumix-island>` custom element as it evaluates, and " +
    "the unit tier runs in Node with no `HTMLElement` to extend",
  "plumix/blocks/island-runtime":
    "imports `@plumix/blocks/island-runtime` for its side effect and " +
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

// Only a function or an object has an identity to trace back to a source;
// a primitive would match any constant that happens to share its value.
function hasIdentity(value: unknown): value is object {
  return (
    typeof value === "function" || (typeof value === "object" && value !== null)
  );
}

// Every internal module that exports a value, keyed by the value itself. A
// namespace counts as its own module's, so republishing one whole is caught.
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

// What a row cannot see: an entry is only checked once someone writes it a
// row, so one that republishes internal values without a row — through an
// import-then-export, a namespace or a local module's `export *` — would
// publish them unreviewed. Traced by identity, so `plumix/vite` building on
// core's values passes until it hands one on.
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

    const source = loaded(sources, entry.mirrors);
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
              `which ${entry.mirrors} exports — publish it, or withhold it ` +
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
              `${entry.mirrors}'s — publish it from the subpath that owns ` +
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
              `${subpath} withholds "${name}", which ${entry.mirrors} no ` +
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

// One import path per value: a name reachable from two subpaths leaves an
// editor's auto-import to pick between them, and neither is wrong enough for a
// review to catch. Compared by identity, so `plumix/fields`'s `date` field and
// `plumix/theme`'s `date` tier builder are two values that share a spelling,
// while one function under two subpaths' names is still one value. A primitive has no
// identity to compare, so two constants only collide when their names do.
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
