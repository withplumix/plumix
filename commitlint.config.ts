import configPnpmScopes from "@commitlint/config-pnpm-scopes";
import type { RuleConfigCondition } from "@commitlint/types";

const extraScopes = ["deps", "deps-dev"];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0],
    "header-max-length": [0],
    "scope-enum": async (ctx: RuleConfigCondition) => {
      const [level, applicable, scopes] =
        await configPnpmScopes.rules["scope-enum"](ctx);
      return [level, applicable, [...scopes, ...extraScopes]];
    },
  },
};
