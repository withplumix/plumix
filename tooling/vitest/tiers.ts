/**
 * Vitest concatenates a package's own `include` onto each project's, feeding
 * both tiers, so a package narrows with `exclude` instead.
 */
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

/**
 * A browser test runs client code as it ships, where `process` does not exist
 * and these reads are already literals.
 */
export const TEST_TIER_DEFINES = {
  "process.env.WORKERS_CI": JSON.stringify(""),
  "process.env.WORKERS_CI_BRANCH": JSON.stringify(""),
  "process.env.PLUMIX_DEV": JSON.stringify(""),
  "process.env.PLUMIX_DEV_ALLOW_REMOTE": JSON.stringify(""),
  "process.env.PLUMIX_EDITOR": JSON.stringify(""),
  "process.env.PLUMIX_EDITOR_PATH_MAP": JSON.stringify(""),
  "process.env.PLUMIX_FORWARD_ERRORS": JSON.stringify(""),
} as const;
