import type { ESLint } from "eslint";

import { maxCommentLength } from "./max-comment-length.js";
import { noBareObjectInput } from "./no-bare-object-input.js";
import { noChainedTypeAssertion } from "./no-chained-type-assertion.js";
import { noErrorMessageInUi } from "./no-error-message-in-ui.js";
import { noForgedApp } from "./no-forged-app.js";
import { noJsdocInFunctionBody } from "./no-jsdoc-in-function-body.js";
import { noModuleMocking } from "./no-module-mocking.js";
import { noNonTestidQueries } from "./no-non-testid-queries.js";
import { noReflectApply } from "./no-reflect-apply.js";
import { noReflectGet } from "./no-reflect-get.js";
import { noSpelledCapability } from "./no-spelled-capability.js";
import { noUnknownReturn } from "./no-unknown-return.js";
import { noUnknownTypeAlias } from "./no-unknown-type-alias.js";
import { noUnparsedPropertyTypeof } from "./no-unparsed-property-typeof.js";
import { noUnsafeDictionary } from "./no-unsafe-dictionary.js";
import { preferJsdoc } from "./prefer-jsdoc.js";
import { testTier } from "./test-tier.js";

/**
 * The selectors match syntax, so `Reflect["get"]` slips past on purpose: these
 * nudge the shapes code actually takes, not a sandbox.
 */
export const plumixPlugin: ESLint.Plugin = {
  rules: {
    "max-comment-length": maxCommentLength,
    "no-bare-object-input": noBareObjectInput,
    "no-chained-type-assertion": noChainedTypeAssertion,
    "no-error-message-in-ui": noErrorMessageInUi,
    "no-forged-app": noForgedApp,
    "no-jsdoc-in-function-body": noJsdocInFunctionBody,
    "no-module-mocking": noModuleMocking,
    "no-non-testid-queries": noNonTestidQueries,
    "no-reflect-apply": noReflectApply,
    "no-reflect-get": noReflectGet,
    "no-spelled-capability": noSpelledCapability,
    "no-unknown-return": noUnknownReturn,
    "no-unknown-type-alias": noUnknownTypeAlias,
    "no-unparsed-property-typeof": noUnparsedPropertyTypeof,
    "no-unsafe-dictionary": noUnsafeDictionary,
    "prefer-jsdoc": preferJsdoc,
    "test-tier": testTier,
  },
};
