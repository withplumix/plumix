import type { ESLint } from "eslint";

import { noNonTestidQueries } from "./no-non-testid-queries.js";
import { noReflectApply } from "./no-reflect-apply.js";
import { noReflectGet } from "./no-reflect-get.js";
import { noUnknownTypeAlias } from "./no-unknown-type-alias.js";

/**
 * First-party rules for the conventions this repo holds by discipline alone
 * (issue #1807) — mostly types that were declared rather than earned, plus
 * the test-id query convention. Registered as a single named plugin in
 * `baseConfig`, so rule ids read `plumix/<rule>`.
 *
 * The selectors match syntax, not resolved values — `Reflect["get"](x, k)` and
 * a destructured `const { get } = Reflect` both slip past. That's deliberate:
 * these are nudges aimed at the shapes agent-authored code actually writes,
 * not a sandbox, and the dotted form is the only one that occurs naturally.
 */
export const plumixPlugin: ESLint.Plugin = {
  rules: {
    "no-non-testid-queries": noNonTestidQueries,
    "no-reflect-apply": noReflectApply,
    "no-reflect-get": noReflectGet,
    "no-unknown-type-alias": noUnknownTypeAlias,
  },
};
