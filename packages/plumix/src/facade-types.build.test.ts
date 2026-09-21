import { resolve } from "node:path";
import ts from "typescript";
import { beforeAll, describe, expect, test } from "vitest";

import {
  CURATED_REEXPORT,
  declarationOf,
  packageDir,
  subpathsMatching,
} from "../test/facade-entries.js";

// The same subpaths `facade-curated.test.ts` holds a drift guard for, keyed to
// their published declarations.
const curated = new Map(
  subpathsMatching(CURATED_REEXPORT).map((subpath) => [
    subpath,
    declarationOf(subpath),
  ]),
);

// The types that have no role subpath, so the root is their only home. Every
// other type core's barrel exports sits on the root and on exactly one other
// subpath.
interface RootOnly {
  readonly reason: string;
  readonly names: readonly string[];
}

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

// Types stay wholesale on the root because the declaration emitter needs them
// there. Printing a type a consumer's `.d.ts` inferred, it picks the specifier
// with the fewest path components: the root has none, and on a tie between
// `plumix/plugin` and `@plumix/core` it keeps the declaring package, which no
// consumer can resolve (#2347). A role subpath re-exports its own types on top,
// so a theme or a plugin file still needs one import. `facade-curated.test.ts`
// compares values at runtime; types only exist for the compiler, so this asks it.
describe("types", () => {
  let coreTypes: Map<string, ts.Symbol>;
  let subpathTypes: Map<string, Map<string, ts.Symbol>>;

  // Read from the published declarations, which is what a consumer's compiler
  // resolves. They carry no function bodies, so the program grows with the
  // public surface rather than with every source file behind it. Parsing is
  // CPU-bound, so it stretches with whatever runs beside it: ~1.1s alone, 6.6s
  // when turbo runs `test:unit` alongside `test:build` in a full `pnpm test`.
  beforeAll(() => {
    const config = ts.getParsedCommandLineOfConfigFile(
      resolve(packageDir, "tsconfig.json"),
      {},
      { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => undefined },
    );
    if (config === undefined) throw new Error("tsconfig.json did not parse");
    const program = ts.createProgram([...curated.values()], config.options);
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

    const coreFile = ts.resolveModuleName(
      "@plumix/core",
      resolve(packageDir, "package.json"),
      config.options,
      ts.sys,
    ).resolvedModule?.resolvedFileName;
    if (coreFile === undefined) throw new Error("@plumix/core did not resolve");
    coreTypes = typesOf(coreFile);
    subpathTypes = new Map(
      [...curated].map(([subpath, file]) => [subpath, typesOf(file)]),
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
