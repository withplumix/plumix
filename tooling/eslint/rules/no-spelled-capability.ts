import * as path from "node:path";
import type { Rule } from "eslint";

// Core's capability actions (`POST_TYPE_CAPABILITY_ACTIONS`,
// `TERM_TAXONOMY_CAPABILITY_ACTIONS`). Restated rather than imported: the lint
// config is tooling and builds before core. An action added there and missed
// here only lets that one spelling through.
const ENTRY_ACTIONS = [
  "read",
  "create",
  "edit_own",
  "publish",
  "edit_any",
  "delete",
  "read_revisions",
  "restore_revision",
];
const TERM_ACTIONS = ["read", "assign", "edit", "delete", "manage"];

// The whole literal, so a hook name (`entry:media:trashed`) or an example list
// of several capabilities in one string does not match. An interpolation
// stands in as one segment character, so `entry:${type}:read` still does.
const SPELLED = new RegExp(
  `^(?:entry:[^:\\s]+:(?:${ENTRY_ACTIONS.join("|")})|term:[^:\\s]+:(?:${TERM_ACTIONS.join("|")}))$`,
);

const INTERPOLATION = "\u0000";

interface TemplateParts {
  readonly quasis: readonly {
    readonly value: { readonly cooked?: string | null; readonly raw: string };
  }[];
}

function templateText(node: TemplateParts): string {
  return node.quasis
    .map((quasi) => quasi.value.cooked ?? quasi.value.raw)
    .join(INTERPOLATION);
}

interface Options {
  readonly definers?: readonly string[];
}

/**
 * An entry or term capability is named by what it guards —
 * `entryCapability(type, action)` / `termCapability(taxonomy, action)` — and
 * the registry spells the string, under the namespace a pooled type gates in.
 * A literal skips that and misses the pool (#2436). The few modules that
 * define the shape are named per package through `definers`.
 */
export const noSpelledCapability: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow entry and term capabilities spelled as string literals.",
    },
    messages: {
      noSpelledCapability:
        "Name the capability by what it guards — `entryCapability(type, action)` or `termCapability(taxonomy, action)` — instead of spelling it. A spelled entry capability misses the namespace a pooled type gates under (issue #2436).",
    },
    schema: [
      {
        type: "object",
        properties: {
          definers: { type: "array", items: { type: "string" } },
        },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    const [options] = context.options as [Options?];
    const relative = path
      .relative(context.cwd, context.filename)
      .split(path.sep)
      .join("/");
    if (options?.definers?.includes(relative)) return {};

    return {
      Literal(node) {
        if (typeof node.value === "string" && SPELLED.test(node.value)) {
          context.report({ node, messageId: "noSpelledCapability" });
        }
      },
      TemplateLiteral(node) {
        if (SPELLED.test(templateText(node))) {
          context.report({ node, messageId: "noSpelledCapability" });
        }
      },
    };
  },
};
