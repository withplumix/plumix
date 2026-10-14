import type { RuleConfigCondition } from "@commitlint/types";
import configPnpmScopes from "@commitlint/config-pnpm-scopes";

// Only dependabot's scopes get an exception — everything else must
// map to a workspace package or carry no scope.
const extraScopes = ["deps", "deps-dev"];

// Dependabot writes "Bump x from a to b", which fails subject-case, and
// offers no way to lowercase it. Its commits are signed, so skip them.
const dependabotSignOff = "Signed-off-by: dependabot[bot] <support@github.com>";

export default {
  extends: ["@commitlint/config-conventional"],
  ignores: [(message: string) => message.includes(dependabotSignOff)],
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
