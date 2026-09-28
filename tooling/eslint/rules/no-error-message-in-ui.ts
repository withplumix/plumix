import type { Rule } from "eslint";
import ts from "typescript";

import { commentBlockAbove, wordsAfterMarker } from "./comment-block.js";
import { readTypeAwareServices } from "./type-services.js";

// The fourth marker in the family `// Safety:`, `Not JSON:` and `Not parsed:`
// belong to. A render boundary has no descriptor to choose — the exception is
// the only thing that can name what threw — so it says why it shows the text.
const SHOWN_VERBATIM_MARKER = /(^|\s)shown\s+verbatim:/i;
const MIN_REASON_WORDS = 6;

/** Whether `type` is the lib's `Error`, or a class that extends it. */
function isErrorType(program: ts.Program, type: ts.Type): boolean {
  const seen = new Set<ts.Type>();
  const visit = (candidate: ts.Type): boolean => {
    if (seen.has(candidate)) return false;
    seen.add(candidate);
    const symbol = candidate.getSymbol();
    if (
      symbol?.getName() === "Error" &&
      symbol
        .getDeclarations()
        ?.some((declaration) =>
          program.isSourceFileDefaultLibrary(declaration.getSourceFile()),
        )
    ) {
      return true;
    }
    if (!(candidate.flags & ts.TypeFlags.Object)) return false;
    if (candidate.isClassOrInterface()) {
      return (candidate.getBaseTypes() ?? []).some(visit);
    }
    // A generic instantiation (`ORPCError<"CONFLICT", …>`) hangs its base
    // types off the declaration it was instantiated from.
    const reference = candidate as ts.TypeReference;
    return (
      (reference.objectFlags & ts.ObjectFlags.Reference) !== 0 &&
      reference.target !== candidate &&
      visit(reference.target)
    );
  };
  const arms = type.isUnion() ? type.types : [type];
  return arms.some(visit);
}

function isConsoleArgument(node: Rule.Node): boolean {
  const parent: Rule.Node | null = node.parent;
  const current = parent?.type === "ChainExpression" ? parent : node;
  const call: Rule.Node | null = current.parent;
  if (call?.type !== "CallExpression") return false;
  const { callee } = call;
  return (
    call.arguments.some((argument) => argument === current) &&
    callee.type === "MemberExpression" &&
    callee.object.type === "Identifier" &&
    callee.object.name === "console"
  );
}

/** The statement a read sits in — where the note explaining it belongs. */
function enclosingStatement(node: Rule.Node): Rule.Node {
  let current: Rule.Node = node;
  for (;;) {
    if (current.type.endsWith("Statement")) return current;
    if (current.type.endsWith("Declaration")) return current;
    const parent: Rule.Node | null = current.parent;
    if (parent === null) return current;
    current = parent;
  }
}

/**
 * A caught error's `message` is text the admin didn't choose: oRPC's English
 * name for a status code, a gateway's body, a parser's complaint. The admin
 * shows every failure through a localized descriptor it picked instead (ADR
 * 0018), so reading `.message` off an `Error` in admin source is where that
 * text would leak onto the screen.
 *
 * Two reads stay silent. An argument to `console.*` goes to a developer, not
 * the screen. And a render boundary that shows a client exception as
 * secondary detail says so in a `// Shown verbatim: …` comment directly above
 * the statement, giving the reason in a sentence.
 */
export const noErrorMessageInUi: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow reading a caught error's `message` in admin UI.",
    },
    messages: {
      errorMessageInUi:
        "A caught error's `message` is text the admin didn't choose, and it reaches the screen untranslated. Map the failure to a descriptor — `describeRpcError` from `plumix/admin` with a localized fallback. Where a render boundary genuinely has nothing but the exception to show, say why in a `// Shown verbatim: …` comment directly above this statement (ADR 0018).",
      shownVerbatimReasonTooThin:
        "A `// Shown verbatim:` comment has to say why this text reaches the screen, not merely mark it — write the sentence a reviewer would need (ADR 0018).",
    },
    schema: [],
  },
  create(context) {
    const services = readTypeAwareServices(context);
    if (!services) return {};
    const checker = services.program.getTypeChecker();
    return {
      "MemberExpression[computed=false][property.name='message']"(
        node: Rule.Node,
      ) {
        if (node.type !== "MemberExpression") return;
        const parent = node.parent;
        if (parent.type === "AssignmentExpression" && parent.left === node) {
          return;
        }
        const object = services.esTreeNodeToTSNodeMap.get(node.object);
        if (!object) return;
        if (!isErrorType(services.program, checker.getTypeAtLocation(object))) {
          return;
        }
        if (isConsoleArgument(node)) return;
        const words = wordsAfterMarker(
          commentBlockAbove(
            context.sourceCode,
            enclosingStatement(node).loc?.start.line ?? 0,
          ),
          SHOWN_VERBATIM_MARKER,
        );
        if (words === null) {
          context.report({ node, messageId: "errorMessageInUi" });
        } else if (words < MIN_REASON_WORDS) {
          context.report({ node, messageId: "shownVerbatimReasonTooThin" });
        }
      },
    };
  },
};
