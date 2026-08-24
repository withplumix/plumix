import type { ESLint } from "eslint";

import { noBareObjectInput } from "./no-bare-object-input.js";
import { noChainedTypeAssertion } from "./no-chained-type-assertion.js";
import { noModuleMocking } from "./no-module-mocking.js";
import { noNonTestidQueries } from "./no-non-testid-queries.js";
import { noReflectApply } from "./no-reflect-apply.js";
import { noReflectGet } from "./no-reflect-get.js";
import { noUnknownReturn } from "./no-unknown-return.js";
import { noUnknownTypeAlias } from "./no-unknown-type-alias.js";
import { noUnparsedPropertyTypeof } from "./no-unparsed-property-typeof.js";
import { noUnsafeDictionary } from "./no-unsafe-dictionary.js";

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
    "no-bare-object-input": noBareObjectInput,
    "no-chained-type-assertion": noChainedTypeAssertion,
    "no-module-mocking": noModuleMocking,
    "no-non-testid-queries": noNonTestidQueries,
    "no-reflect-apply": noReflectApply,
    "no-reflect-get": noReflectGet,
    "no-unknown-return": noUnknownReturn,
    "no-unknown-type-alias": noUnknownTypeAlias,
    "no-unparsed-property-typeof": noUnparsedPropertyTypeof,
    "no-unsafe-dictionary": noUnsafeDictionary,
  },
};
