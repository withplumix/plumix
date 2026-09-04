import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";

import type { RuntimeE2E } from "./runtime-e2e.js";

// Test-only: builds a playground directory the way pnpm lays one out, so the
// helpers that read a runtime's `plumix.e2e` block run against a real
// filesystem.

export interface FakePackage {
  readonly name: string;
  readonly plumix?: {
    readonly scaffold?: { readonly kind: string; readonly label?: string };
    readonly e2e?: Omit<RuntimeE2E, "packageName">;
  };
}

export const CLOUDFLARE_E2E: Omit<RuntimeE2E, "packageName"> = {
  wipe: [".wrangler/state"],
  database: {
    glob: ".wrangler/state/v3/d1/miniflare-D1DatabaseObject/*.sqlite",
    exclude: ["metadata.sqlite"],
  },
};

export function runtimePackage(
  name: string,
  e2e?: Omit<RuntimeE2E, "packageName">,
): FakePackage {
  return { name, plumix: { scaffold: { kind: "runtime", label: name }, e2e } };
}

/**
 * A temporary playground: its own package.json naming the dependencies, and
 * each dependency's package.json under `node_modules`.
 */
export async function makePlayground(
  packages: readonly FakePackage[],
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "plumix-playground-"));
  await writeFile(
    join(dir, "package.json"),
    JSON.stringify({
      name: "playground",
      dependencies: Object.fromEntries(
        packages.map((pkg) => [pkg.name, "workspace:*"]),
      ),
    }),
  );
  for (const pkg of packages) {
    const pkgDir = join(dir, "node_modules", pkg.name);
    await mkdir(pkgDir, { recursive: true });
    await writeFile(join(pkgDir, "package.json"), JSON.stringify(pkg));
  }
  return dir;
}

/** `makePlayground` with the directories removed after each test. */
export function usePlaygrounds(): (
  packages: readonly FakePackage[],
) => Promise<string> {
  const dirs: string[] = [];
  afterEach(async () => {
    for (const dir of dirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });
  return async (packages) => {
    const dir = await makePlayground(packages);
    dirs.push(dir);
    return dir;
  };
}
