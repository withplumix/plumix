// Dependabot writes "Bump x from a to b", which fails subject-case, and
// offers no way to lowercase it. Its commits are signed, so skip them.
const dependabotSignOff = "Signed-off-by: dependabot[bot] <support@github.com>";

export default {
  extends: [
    "@commitlint/config-conventional",
    "@commitlint/config-pnpm-scopes",
  ],
  ignores: [(message: string) => message.includes(dependabotSignOff)],
  rules: {
    "body-max-line-length": [0],
    "header-max-length": [0],
  },
};
