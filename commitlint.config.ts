import configPnpmScopes from "@commitlint/config-pnpm-scopes";
import type { RuleConfigCondition } from "@commitlint/types";

// `deps`/`deps-dev` for dependabot, `docs`/`media` for cross-cutting
// scopes that don't map to a single workspace package.
const extraScopes = ["deps", "deps-dev", "docs", "media"];

export default {
  extends: ["@commitlint/config-conventional"],
  // PRD #379 opened with a `spike:` proof-of-concept commit before the
  // rearchitecture's conventional-commit cadence stabilised. Skip just
  // that historical commit; the rule still applies to every other one.
  ignores: [(message: string) => message.startsWith("spike: ")],
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
