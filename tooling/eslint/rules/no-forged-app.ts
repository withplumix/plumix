import type { Rule } from "eslint";
import ts from "typescript";

import { readTypeAwareServices } from "./type-services.js";

const BUILDER_FOR_RECORD = {
  AppContext: "createTestContext",
  PlumixApp: "createDispatcherHarness().app",
} as const;

type RecordName = keyof typeof BUILDER_FOR_RECORD;

function isRecordName(name: string): name is RecordName {
  return Object.hasOwn(BUILDER_FOR_RECORD, name);
}

// An alias of an alias names the outer one — `type Ctx = AppContext` resolves
// to a type whose alias symbol is `Ctx` — so walk the declarations back to the
// record they point at. The record is recognised by its own symbol's name, not
// its declaring file: this package cannot import core's declarations, and a test
// helper that declares its own `AppContext` is forging the same thing. `seen`
// is there because lint runs on code that does not compile, where an alias can
// refer to itself.
function aliasedRecord(
  checker: ts.TypeChecker,
  symbol: ts.Symbol | undefined,
  seen = new Set<ts.Symbol>(),
): RecordName | undefined {
  if (!symbol || seen.has(symbol)) return undefined;
  seen.add(symbol);
  if (isRecordName(symbol.name)) return symbol.name;
  for (const declaration of symbol.declarations ?? []) {
    if (!ts.isTypeAliasDeclaration(declaration)) continue;
    const name = recordInNode(checker, declaration.type, seen);
    if (name) return name;
  }
  return undefined;
}

// The record as written, before TypeScript flattens it: `AppContext` is itself
// an intersection, so `AppContext & X` resolves to parts that no longer carry
// the name, while each constituent of the written type still does.
function recordInNode(
  checker: ts.TypeChecker,
  node: ts.TypeNode,
  seen = new Set<ts.Symbol>(),
): RecordName | undefined {
  if (ts.isParenthesizedTypeNode(node)) {
    return recordInNode(checker, node.type, seen);
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) {
    for (const part of node.types) {
      const name = recordInNode(checker, part, seen);
      if (name) return name;
    }
    return undefined;
  }
  if (!ts.isTypeReferenceNode(node)) return undefined;
  let target = checker.getSymbolAtLocation(node.typeName);
  if (target && (target.flags & ts.SymbolFlags.Alias) !== 0) {
    target = checker.getAliasedSymbol(target);
  }
  const [wrapped] = node.typeArguments ?? [];
  if (target?.name === "Readonly" && wrapped) {
    return recordInNode(checker, wrapped, seen);
  }
  return aliasedRecord(checker, target, seen);
}

// `Readonly<…>`, an intersection and a union such as `PlumixApp | undefined`
// still hand the caller every field of the record inside them, so asserting
// into any of them forges that record too. Read off the resolved type, for an
// `as never` slot that has no written type to walk.
function recordIn(
  checker: ts.TypeChecker,
  type: ts.Type,
): RecordName | undefined {
  const named =
    aliasedRecord(checker, type.aliasSymbol) ??
    aliasedRecord(checker, type.getSymbol());
  if (named) return named;
  if (type.aliasSymbol?.name === "Readonly") {
    const [wrapped] = type.aliasTypeArguments ?? [];
    return wrapped && recordIn(checker, wrapped);
  }
  if (type.isUnionOrIntersection()) {
    for (const part of type.types) {
      const name = recordIn(checker, part);
      if (name) return name;
    }
  }
  return undefined;
}

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
    // only the checker can tell that apart from a value already shaped like it —
    // or see the record behind an alias the source spells differently (#2339).
    const services = readTypeAwareServices(context);
    if (!services) return {};
    const checker = services.program.getTypeChecker();
    return {
      TSAsExpression(node: Rule.Node) {
        const assertion = services.esTreeNodeToTSNodeMap.get(node);
        if (!assertion || !ts.isAsExpression(assertion)) return;
        // `never` fits any slot, so it forges whatever the slot expects.
        const slot = assertion.type.kind === ts.SyntaxKind.NeverKeyword;
        const asserted = slot
          ? checker.getContextualType(assertion)
          : checker.getTypeFromTypeNode(assertion.type);
        if (!asserted) return;
        const name =
          (slot ? undefined : recordInNode(checker, assertion.type)) ??
          recordIn(checker, asserted);
        if (!name) return;
        const operand = checker.getTypeAtLocation(assertion.expression);
        // `any` is assignable to everything, so it has to be named.
        const forged =
          (operand.flags & ts.TypeFlags.Any) !== 0 ||
          !checker.isTypeAssignableTo(operand, asserted);
        if (!forged) return;
        context.report({
          node,
          messageId: "forged",
          data: { name, builder: BUILDER_FOR_RECORD[name] },
        });
      },
    };
  },
};
