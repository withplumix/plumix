import type { Rule } from "eslint";

const THROUGH_UNKNOWN =
  "TSAsExpression.expression[typeAnnotation.type='TSUnknownKeyword']";

/**
 * A test forging the whole request context is exercising a module that should
 * have declared the slice it reads (issue #2307). Scoped to test files, where
 * the general chained-assertion rule steps back, and held at zero there.
 */
export const noForgedAppContext: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow forging an `AppContext` through `unknown`.",
    },
    messages: {
      noForgedAppContext:
        "Don't forge an AppContext through `unknown`. Narrow the parameter to the fields it reads (`Pick<AppContext, …>`), or build a real context with `createTestContext` (issue #2307).",
    },
    schema: [],
  },
  create(context) {
    return {
      [`TSAsExpression[typeAnnotation.typeName.name='AppContext'] > ${THROUGH_UNKNOWN}, TSAsExpression[typeAnnotation.typeName.right.name='AppContext'] > ${THROUGH_UNKNOWN}`](
        node: Rule.Node,
      ) {
        context.report({ node, messageId: "noForgedAppContext" });
      },
    };
  },
};
