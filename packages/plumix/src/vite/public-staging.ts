import { cp, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

/**
 * Copy the workspace's user-facing `public/` directory contents into
 * Vite's resolved `publicDir`. Files in `public/robots.txt` end up at
 * `<publicDir>/robots.txt` so that:
 *   - the dev server (Vite) serves them at `/robots.txt`
 *   - `vite build` copies them into the static-asset output directory
 *
 * No-op when the workspace has no `public/` directory. Files under the
 * reserved `_plumix/` namespace are skipped — admin staging owns that
 * subtree and a user copy would corrupt the freshness check that gates
 * `stageAdminAssets`.
 */
export async function stageUserPublic(args: {
  readonly workspaceRoot: string;
  readonly publicDir: string;
}): Promise<void> {
  const source = resolve(args.workspaceRoot, "public");
  let stats: Awaited<ReturnType<typeof stat>>;
  try {
    stats = await stat(source);
  } catch {
    return;
  }
  if (!stats.isDirectory()) return;
  await cp(source, args.publicDir, {
    recursive: true,
    filter: (src) => !isReservedPath(source, src),
  });
}

function isReservedPath(sourceRoot: string, src: string): boolean {
  const head = relative(sourceRoot, src).split(sep, 1)[0];
  return head === "_plumix";
}
