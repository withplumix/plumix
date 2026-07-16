export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const KNOWN: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

/**
 * Identify the package manager the user invoked us with, from the
 * `npm_config_user_agent` string every manager sets (e.g.
 * `"pnpm/8.15.0 npm/? node/..."`). Falls back to npm when it is absent or
 * names a manager we do not special-case.
 */
export function detectPackageManager(userAgent?: string): PackageManager {
  const name = userAgent?.split(" ")[0]?.split("/")[0];
  return KNOWN.find((pm) => pm === name) ?? "npm";
}

export function isKnownPackageManager(name: string): name is PackageManager {
  return (KNOWN as readonly string[]).includes(name);
}

export const PACKAGE_MANAGERS = KNOWN;
