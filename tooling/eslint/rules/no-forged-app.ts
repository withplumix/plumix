import type { Rule } from "eslint";
import ts from "typescript";

import { readTypeAwareServices } from "./type-services.js";

const BUILDER_FOR_RECORD = {
  AppContext: "createTestContext",
  PlumixApp: "createDispatcherHarness().app",
} as const;

const assertedAs = (name: string): string =>
  `TSAsExpression[typeAnnotation.typeName.name='${name}'], TSAsExpression[typeAnnotation.typeName.right.name='${name}']`;

/**
 * A test forging a whole app record is exercising a module that should have
 * declared the slice it reads (issues #2307, #2338). Scoped to test files, where
 * the general chained-assertion rule steps back, and held at zero there.
 */
export const noForgedApp: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow asserting a value that is not already an `AppContext` or `PlumixApp` into one.",
    },
    messages: {
      forged:
        "Don't forge a {{name}} by asserting a value that isn't one into it. Narrow the parameter to the fields it reads (`Pick<{{name}}, …>`), or build a real one with `{{builder}}` (issues #2307, #2338).",
    },
    schema: [],
  },
  create(context) {
    // `as` only asks that the two types overlap, so `as unknown as`, one `as`
    // off an untyped value and a partial literal all compile. A forgery is any
    // operand that would not pass for the record without the assertion, and
    // only the checker can tell that apart from a value already shaped like it.
    const services = readTypeAwareServices(context);
    if (!services) return {};
    const checker = services.program.getTypeChecker();
    return Object.fromEntries(
      Object.entries(BUILDER_FOR_RECORD).map(([name, builder]) => [
        assertedAs(name),
        (node: Rule.Node) => {
          const assertion = services.esTreeNodeToTSNodeMap.get(node);
          if (!assertion || !ts.isAsExpression(assertion)) return;
          const operand = checker.getTypeAtLocation(assertion.expression);
          const record = checker.getTypeFromTypeNode(assertion.type);
          // `any` is assignable to everything, so it has to be named.
          const forged =
            (operand.flags & ts.TypeFlags.Any) !== 0 ||
            !checker.isTypeAssignableTo(operand, record);
          if (!forged) return;
          context.report({
            node,
            messageId: "forged",
            data: { name, builder },
          });
        },
      ]),
    );
  },
};
