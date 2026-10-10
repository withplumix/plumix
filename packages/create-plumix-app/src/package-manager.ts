export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

const KNOWN: readonly PackageManager[] = ["npm", "pnpm", "yarn", "bun"];

/**
 * Falls back to npm when the user agent is absent or names a manager not
 * special-cased.
 */
export function detectPackageManager(userAgent?: string): PackageManager {
  const name = userAgent?.split(" ")[0]?.split("/")[0];
  return KNOWN.find((pm) => pm === name) ?? "npm";
}

export function isKnownPackageManager(name: string): name is PackageManager {
  return (KNOWN as readonly string[]).includes(name);
}

export const PACKAGE_MANAGERS = KNOWN;
