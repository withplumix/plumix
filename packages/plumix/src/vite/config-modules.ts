import ts from "typescript";

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

export function extractConfigModules(source: string): ConfigModules {
  const sf = ts.createSourceFile(
    "plumix.config.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  // Value-binding local name -> specifier, plus the local names bound to the
  // `plumix` factory export (via a `plumix` import, canonical or aliased).
  const importOf = new Map<string, string>();
  const factoryLocals = new Set<string>();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement)) continue;
    const clause = statement.importClause;
    if (
      !clause ||
      clause.isTypeOnly ||
      !ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      continue;
    }
    const spec = statement.moduleSpecifier.text;
    if (clause.name) importOf.set(clause.name.text, spec);
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) {
      importOf.set(bindings.name.text, spec);
    } else if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (element.isTypeOnly) continue;
        importOf.set(element.name.text, spec);
        const imported = (element.propertyName ?? element.name).text;
        if (isPlumixSpecifier(spec) && imported === "plumix") {
          factoryLocals.add(element.name.text);
        }
      }
    }
  }

  let call: ts.CallExpression | undefined;
  const walk = (node: ts.Node): void => {
    if (call) return;
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      factoryLocals.has(node.expression.text)
    ) {
      call = node;
      return;
    }
    ts.forEachChild(node, walk);
  };
  walk(sf);

  const cfg = call?.arguments[0];
  if (!cfg || !ts.isObjectLiteralExpression(cfg)) {
    return { theme: undefined, plugins: [] };
  }
  return {
    theme: traceTheme(cfg, importOf),
    plugins: tracePlugins(cfg, importOf),
  };
}

function traceTheme(
  cfg: ts.ObjectLiteralExpression,
  importOf: ReadonlyMap<string, string>,
): string | undefined {
  const prop = cfg.properties.find((p) => propKey(p) === "theme");
  let value: ts.Expression | undefined;
  if (prop && ts.isShorthandPropertyAssignment(prop)) value = prop.name;
  else if (prop && ts.isPropertyAssignment(prop)) value = prop.initializer;
  return value && ts.isIdentifier(value) ? importOf.get(value.text) : undefined;
}

function tracePlugins(
  cfg: ts.ObjectLiteralExpression,
  importOf: ReadonlyMap<string, string>,
): readonly string[] {
  const prop = cfg.properties.find((p) => propKey(p) === "plugins");
  if (
    !prop ||
    !ts.isPropertyAssignment(prop) ||
    !ts.isArrayLiteralExpression(prop.initializer)
  ) {
    return [];
  }
  const specs: string[] = [];
  for (const element of prop.initializer.elements) {
    // `media()` → the callee; `audit` → the binding itself.
    const ident =
      ts.isCallExpression(element) && ts.isIdentifier(element.expression)
        ? element.expression
        : ts.isIdentifier(element)
          ? element
          : undefined;
    const spec = ident && importOf.get(ident.text);
    if (spec) specs.push(spec);
  }
  return specs;
}

const propKey = (p: ts.ObjectLiteralElementLike): string | undefined =>
  p.name && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))
    ? p.name.text
    : undefined;
