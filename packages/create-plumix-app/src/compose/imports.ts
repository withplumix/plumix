// Named-import statement: `import { a, b } from "module";`. Descriptors
// only emit this form; anything else passes through untouched.
const NAMED_IMPORT_RE = /^import\s+\{([^}]+)\}\s+from\s+"([^"]+)";$/;

/**
 * Collapse named imports from the same module into one statement, so a
 * plugin's runtime-capability import (e.g. `r2`) folds into the runtime's
 * own import line rather than emitting a second import from the same module.
 * Module order follows first appearance; symbols are deduped and sorted.
 */
export function mergeImports(lines: readonly string[]): string[] {
  // Map preserves first-insertion order, giving stable module ordering.
  const bySpecifier = new Map<string, Set<string>>();
  const passthrough: string[] = [];

  for (const line of lines) {
    const match = NAMED_IMPORT_RE.exec(line);
    const names = match?.[1];
    const specifier = match?.[2];
    if (!names || !specifier) {
      passthrough.push(line);
      continue;
    }
    const symbols = bySpecifier.get(specifier) ?? new Set();
    bySpecifier.set(specifier, symbols);
    for (const symbol of names
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)) {
      symbols.add(symbol);
    }
  }

  const merged = [...bySpecifier].map(
    ([specifier, symbols]) =>
      `import { ${[...symbols].sort().join(", ")} } from "${specifier}";`,
  );
  return [...merged, ...passthrough];
}
