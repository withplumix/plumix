// The two test tiers, by filename (ADR 0021). `*.build.test.*` is a third,
// separate run (`test:build`), so both tiers here leave it out. The globs
// reach the whole package: vitest concatenates a package's own `include` onto
// each project's, so a package adding one would feed its files to both tiers.
// A package narrows with `exclude` instead.
export const NODE_TIER = {
  name: "node",
  include: ["**/*.test.{ts,tsx}"],
  exclude: ["**/*.build.test.{ts,tsx}", "**/*.browser.test.{ts,tsx}"],
} as const;

export const BROWSER_TIER = {
  name: "browser",
  include: ["**/*.browser.test.{ts,tsx}"],
  exclude: ["**/*.build.test.{ts,tsx}"],
  browser: "chromium",
  headless: true,
  viewport: { width: 1440, height: 900 },
  // Vitest would write a failing test's screenshot into the source tree.
  screenshotFailures: false,
} as const;

// What the `plumix` Vite plugin substitutes into a production client build.
// A browser test runs the client code as it ships, where `process` does not
// exist and every one of these reads is already a literal.
export const TEST_TIER_DEFINES = {
  "process.env.WORKERS_CI": JSON.stringify(""),
  "process.env.WORKERS_CI_BRANCH": JSON.stringify(""),
  "process.env.PLUMIX_DEV": JSON.stringify(""),
  "process.env.PLUMIX_DEV_ALLOW_REMOTE": JSON.stringify(""),
  "process.env.PLUMIX_EDITOR": JSON.stringify(""),
  "process.env.PLUMIX_EDITOR_PATH_MAP": JSON.stringify(""),
  "process.env.PLUMIX_FORWARD_ERRORS": JSON.stringify(""),
} as const;
