import type { ESTree } from "vite";

import {
  callSites,
  memberKey,
  moduleExportName,
  parseModule,
} from "./estree.js";

/**
 * The module specifiers a plumix config imports its theme and plugins from,
 * recovered statically from the config source so the editor codegen knows which
 * files to scan for block declarations. `theme` is the specifier behind the
 * `theme:` binding (or `undefined`); `plugins` are the specifiers behind each
 * traceable `plugins:` entry (factory call or bare descriptor). Entries that
 * aren't a resolvable import binding are dropped rather than guessed.
 */
export interface ConfigModules {
  readonly theme: string | undefined;
  readonly plugins: readonly string[];
}

const isPlumixSpecifier = (spec: string): boolean =>
  spec === "plumix" || spec.startsWith("plumix/");

export function extractConfigModules(
  source: string,
  filename = "plumix.config.ts",
): ConfigModules {
  const program = parseModule(source, filename);

  // Value-binding local name -> specifier, plus the local names bound to the
  // `plumix` factory export (via a `plumix` import, canonical or aliased).
  const importOf = new Map<string, string>();
  const factoryLocals = new Set<string>();
  for (const statement of program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    if (statement.importKind === "type") continue;
    const spec = statement.source.value;
    for (const specifier of statement.specifiers) {
      if (specifier.type !== "ImportSpecifier") {
        importOf.set(specifier.local.name, spec);
        continue;
      }
      if (specifier.importKind === "type") continue;
      importOf.set(specifier.local.name, spec);
      if (
        isPlumixSpecifier(spec) &&
        moduleExportName(specifier.imported) === "plumix"
      ) {
        factoryLocals.add(specifier.local.name);
      }
    }
  }

  const call = callSites(program).find(
    ({ call }) =>
      call.callee.type === "Identifier" && factoryLocals.has(call.callee.name),
  )?.call;
  const cfg = call?.arguments[0];
  if (cfg?.type !== "ObjectExpression") {
    return { theme: undefined, plugins: [] };
  }
  return {
    theme: traceTheme(cfg.properties, importOf),
    plugins: tracePlugins(cfg.properties, importOf),
  };
}

function propertyValue(
  members: readonly ESTree.ObjectPropertyKind[],
  key: string,
): ESTree.Expression | undefined {
  const member = members.find((m) => memberKey(m) === key);
  return member?.type === "Property" ? member.value : undefined;
}

function traceTheme(
  members: readonly ESTree.ObjectPropertyKind[],
  importOf: ReadonlyMap<string, string>,
): string | undefined {
  const value = propertyValue(members, "theme");
  return value?.type === "Identifier" ? importOf.get(value.name) : undefined;
}

function tracePlugins(
  members: readonly ESTree.ObjectPropertyKind[],
  importOf: ReadonlyMap<string, string>,
): readonly string[] {
  const value = propertyValue(members, "plugins");
  if (value?.type !== "ArrayExpression") return [];
  const specs: string[] = [];
  for (const element of value.elements) {
    // `media()` → the callee; `audit` → the binding itself.
    const ident =
      element?.type === "CallExpression" && element.callee.type === "Identifier"
        ? element.callee
        : element?.type === "Identifier"
          ? element
          : undefined;
    const spec = ident && importOf.get(ident.name);
    if (spec) specs.push(spec);
  }
  return specs;
}
