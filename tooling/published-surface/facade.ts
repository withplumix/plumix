import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const FACADE_DIR = resolve(import.meta.dirname, "../../packages/plumix");

interface ExportSpec {
  readonly types: string;
  readonly default: string;
}

const facadeExports = (
  JSON.parse(readFileSync(resolve(FACADE_DIR, "package.json"), "utf8")) as {
    readonly exports: Readonly<Record<string, ExportSpec>>;
  }
).exports;

const entrySources = Object.entries(facadeExports).map(([subpath, spec]) => {
  const file = spec.default
    .replace(/^\.\/dist\//, "src/")
    .replace(/\.js$/, ".ts");
  return [subpath, readFileSync(resolve(FACADE_DIR, file), "utf8")] as const;
});

/**
 * A subpath curates when its entry re-exports named values from an internal
 * package.
 */
export const CURATED_REEXPORT = /export\s+\{[^}]*\}\s+from\s+["']@plumix\//;

export function subpathsMatching(pattern: RegExp): string[] {
  return entrySources
    .filter(([, source]) => pattern.test(source))
    .map(([subpath]) => subpath)
    .sort();
}

interface RootOnly {
  readonly reason: string;
  readonly names: readonly string[];
}

/**
 * The types that have no role subpath, so the root is their only home. Every
 * other type core's barrel exports sits on the root and on exactly one other
 * subpath.
 */
const ROOT_ONLY_TYPES: readonly RootOnly[] = [
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
      "ListingArchiveTypeOptions",
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
      "UnlistedArchiveTypeOptions",
      "UserMetaContributions",
      "ViewRegistry",
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
      "DevRuntime",
      "EmailMessage",
      "EnvInput",
      "I18nInput",
      "InterfaceToggle",
      "LocaleDirection",
      "LocaleInput",
      "LocaleResolverOverride",
      "Mailer",
      "MailerInput",
      "NormalizedDebugBar",
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

function parseTsconfig(): ts.ParsedCommandLine {
  const config = ts.getParsedCommandLineOfConfigFile(
    resolve(FACADE_DIR, "tsconfig.json"),
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
  );
  if (config === undefined) throw new Error("tsconfig.json did not parse");
  return config;
}

/**
 * Types stay wholesale on the root: the declaration emitter picks the
 * specifier with the fewest path components, and on a tie keeps the declaring
 * package, which no consumer can resolve.
 */
export function typeRoleViolations(): string[] {
  const curated = new Map(
    subpathsMatching(CURATED_REEXPORT).map((subpath) => {
      const spec = facadeExports[subpath];
      if (spec === undefined) throw new Error(`no ${subpath} in plumix`);
      return [subpath, resolve(FACADE_DIR, spec.types)] as const;
    }),
  );
  const config = parseTsconfig();
  const program = ts.createProgram([...curated.values()], config.options);
  const checker = program.getTypeChecker();

  function typesOf(file: string): Map<string, ts.Symbol> {
    const source = program.getSourceFile(file);
    if (source === undefined) throw new Error(`${file} is not built`);
    const module = checker.getSymbolAtLocation(source);
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

  const coreFile = ts.resolveModuleName(
    "@plumix/core",
    resolve(FACADE_DIR, "package.json"),
    config.options,
    ts.sys,
  ).resolvedModule?.resolvedFileName;
  if (coreFile === undefined) throw new Error("@plumix/core did not resolve");
  const coreTypes = typesOf(coreFile);
  const subpathTypes = new Map(
    [...curated].map(([subpath, file]) => [subpath, typesOf(file)]),
  );
  const rootTypes = subpathTypes.get(".");
  const rootOnly = ROOT_ONLY_TYPES.flatMap((group) => group.names);

  function homesOf(name: string, symbol: ts.Symbol): string[] {
    return [...subpathTypes]
      .filter(
        ([subpath, types]) => subpath !== "." && types.get(name) === symbol,
      )
      .map(([subpath]) => subpath);
  }

  const missingFromRoot = [...coreTypes]
    .filter(([name, symbol]) => rootTypes?.get(name) !== symbol)
    .map(
      ([name]) =>
        `plumix . ${name}: the root carries every type core's barrel exports`,
    );

  const homeless = [...coreTypes]
    .filter(([name]) => !rootOnly.includes(name))
    .map(([name, symbol]) => [name, homesOf(name, symbol)] as const)
    .filter(([, homes]) => homes.length !== 1)
    .map(
      ([name, homes]) =>
        `plumix ${homes.join(", ") || "(no subpath)"} ${name}: every other ` +
        "type has exactly one role subpath",
    );

  const misplacedRootOnly = rootOnly
    .filter((name) => {
      const symbol = coreTypes.get(name);
      return symbol === undefined || homesOf(name, symbol).length > 0;
    })
    .map(
      (name) =>
        `plumix . ${name}: a root-only type is a core type no other ` +
        "subpath publishes",
    );

  const seen = new Map<ts.Symbol, string>();
  const twice: string[] = [];
  for (const [subpath, types] of subpathTypes) {
    if (subpath === ".") continue;
    for (const [name, symbol] of types) {
      const first = seen.get(symbol);
      if (first === undefined) seen.set(symbol, subpath);
      else
        twice.push(
          `plumix ${first} and ${subpath} ${name}: no type sits on two ` +
            "subpaths besides the root",
        );
    }
  }

  return [...missingFromRoot, ...homeless, ...misplacedRootOnly, ...twice];
}

/**
 * `plumix/blocks` fills core's loader-context seam with a type-only edge: a
 * theme bundling it for the browser must not pull core in with it.
 */
export function emittedJsViolations(): string[] {
  const emitted = readFileSync(
    resolve(FACADE_DIR, "dist", "blocks", "index.js"),
    "utf8",
  );
  return /["']@plumix\/core["']/.test(emitted)
    ? ["plumix ./blocks: the façade's emitted JS does not import core"]
    : [];
}
