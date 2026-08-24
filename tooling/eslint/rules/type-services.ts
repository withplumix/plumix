import type { Rule } from "eslint";
import type ts from "typescript";

interface TypeAwareServices {
  readonly program: ts.Program;
  // typescript-eslint's own map type, structurally: a lookup keyed by the
  // ESTree node, not a `Map`.
  readonly esTreeNodeToTSNodeMap: { get(node: object): ts.Node | undefined };
}

/**
 * The parser's type information, or null where the rule is running without
 * it. Shared by the type-aware rules so the structural spelling of
 * typescript-eslint's map — and the reason for it — lives in one place.
 */
export function readTypeAwareServices(
  context: Rule.RuleContext,
): TypeAwareServices | null {
  // Safety: ESLint types `parserServices` as an open bag, so there is nothing
  // to narrow to. Reading it as a `Partial` first means both fields are checked
  // below before the value is treated as present.
  const services = context.sourceCode.parserServices as
    Partial<TypeAwareServices> | undefined;
  return services?.program && services.esTreeNodeToTSNodeMap
    ? (services as TypeAwareServices)
    : null;
}
