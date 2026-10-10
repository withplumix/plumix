import { cp, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";

/**
 * Skips the reserved `_plumix/` namespace, which `stageAdminAssets` owns and
 * replaces whole.
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
