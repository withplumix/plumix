import configPnpmScopes from "@commitlint/config-pnpm-scopes";

const extraScopes = ["deps", "deps-dev", "release", "ci", "docs"];

export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "body-max-line-length": [0],
    "header-max-length": [0],
    "scope-enum": async (ctx: unknown) => {
      const [level, applicable, scopes] =
        await configPnpmScopes.rules["scope-enum"](ctx);
      return [level, applicable, [...scopes, ...extraScopes]];
    },
  },
};
