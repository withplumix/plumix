import type { Rule } from "eslint";
import type ts from "typescript";

interface TypeAwareServices {
  readonly program: ts.Program;
  /**
   * typescript-eslint's own map type, structurally: a lookup keyed by the
   * ESTree node, not a `Map`.
   */
  readonly esTreeNodeToTSNodeMap: { get(node: object): ts.Node | undefined };
}

export function readTypeAwareServices(
  context: Rule.RuleContext,
): TypeAwareServices | null {
  // Safety: ESLint types `parserServices` as an open bag; as a `Partial`, both
  // fields are checked below before the value is treated as present.
  const services = context.sourceCode.parserServices as
    Partial<TypeAwareServices> | undefined;
  return services?.program && services.esTreeNodeToTSNodeMap
    ? (services as TypeAwareServices)
    : null;
}
