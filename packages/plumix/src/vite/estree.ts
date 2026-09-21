import type { ESTree } from "vite";
import { parseSync } from "vite";

// Parsed with the bundler's own parser rather than the `typescript` package: a
// consumer's `typescript` may be 7.x, which ships no compiler API, and plumix
// declares no dependency on it.

/**
 * Parse `source`, choosing JSX/TS syntax from `filename`'s extension — which is
 * why callers pass the real path: a syntax error yields an empty program, so a
 * `.ts` file read as TSX would scan as containing nothing. It never throws;
 * Vite's own transform is what reports the error.
 */
export function parseModule(source: string, filename: string): ESTree.Program {
  return parseSync(filename, source).program;
}

/** A module export or import name: an identifier, or an ES2022 string name. */
export function moduleExportName(node: ESTree.ModuleExportName): string {
  return node.type === "Identifier" ? node.name : node.value;
}

/** The static key of an object member, or `undefined` if computed or spread. */
export function memberKey(
  member: ESTree.ObjectPropertyKind,
): string | undefined {
  if (member.type !== "Property" || member.computed) return undefined;
  if (member.key.type === "Identifier") return member.key.name;
  return member.key.type === "Literal" && typeof member.key.value === "string"
    ? member.key.value
    : undefined;
}

export interface CallSite {
  readonly call: ESTree.CallExpression;
  /** The calls whose arguments or callee enclose this one, outermost first. */
  readonly enclosing: readonly ESTree.CallExpression[];
}

function isCall(value: unknown): value is ESTree.CallExpression {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "CallExpression"
  );
}

/** Every call expression under `root`, in source order. */
export function callSites(root: ESTree.Program): readonly CallSite[] {
  const sites: CallSite[] = [];
  const visit = (
    value: unknown,
    enclosing: readonly ESTree.CallExpression[],
  ): void => {
    if (typeof value !== "object" || value === null) return;
    let inner = enclosing;
    if (isCall(value)) {
      sites.push({ call: value, enclosing });
      inner = [...enclosing, value];
    }
    const children: unknown[] = Object.values(value);
    for (const child of children) visit(child, inner);
  };
  visit(root, []);
  return sites;
}
