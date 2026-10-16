/**
 * A package's own `include` is added to this one, not swapped in, so a package
 * narrows with `exclude` instead.
 */
export const NODE_TIER = {
  include: ["**/*.test.{ts,tsx}"],
  exclude: ["**/*.build.test.{ts,tsx}"],
} as const;
