import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const EXCLUDED_SEGMENTS: ReadonlySet<string> = new Set([
  "node_modules",
  ".cache",
  ".turbo",
  ".wrangler",
  ".plumix",
  "dist",
]);

/**
 * Filter passed to `fs.cp` so stray artifacts inside the template
 * source (a developer who ran `pnpm install` against the bundled
 * template during local repro, for instance) never reach scaffolded
 * projects. The check is relative to the template root, so the
 * filter doesn't false-positive when the template itself happens to
 * live under a path containing an excluded segment.
 */
export function shouldCopyTemplateEntry(
  srcAbsPath: string,
  root: string,
): boolean {
  const rel = relative(root, srcAbsPath);
  if (rel === "") return true;
  const segments = rel.split(sep);
  return !segments.some((segment) => EXCLUDED_SEGMENTS.has(segment));
}

interface ScaffoldOptions {
  readonly targetDir: string;
}

interface ScaffoldResult {
  readonly targetDir: string;
  readonly name: string;
}

// Templates live alongside the package's `dist/` (when published) or
// `src/` (during vitest). Both resolve to `<package-root>/templates/`
// via `../templates/` from the source-or-built file.
const TEMPLATES_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "templates",
);

export async function scaffold(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const { targetDir } = options;
  const parent = dirname(targetDir);
  if (!existsSync(parent)) {
    throw new Error(
      `Target parent directory does not exist: ${parent}. Create the parent first, or pick a target inside an existing directory.`,
    );
  }

  if (existsSync(targetDir)) {
    if (!statSync(targetDir).isDirectory()) {
      throw new Error(
        `Target path exists but is not a directory: ${targetDir}. Pick a target that is either a fresh path or an empty directory.`,
      );
    }
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw new Error(
        `Target directory is not empty: ${targetDir}. Pick a fresh path, or empty the existing one first.`,
      );
    }
  } else {
    await mkdir(targetDir);
  }

  const source = join(TEMPLATES_ROOT, "starter");
  await cp(source, targetDir, {
    recursive: true,
    filter: (srcPath) => shouldCopyTemplateEntry(srcPath, source),
  });

  const name = basename(targetDir);
  await rewritePackageName(targetDir, name);

  return { targetDir, name };
}

async function rewritePackageName(dir: string, name: string): Promise<void> {
  const pkgPath = join(dir, "package.json");
  const raw = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as Record<string, unknown>;
  pkg.name = name;
  // 2-space indent + trailing newline to match the rest of the
  // template's JSON files. JSON.stringify rewrites the whole file —
  // fine because the template's package.json is plain JSON we control,
  // no comments or custom key ordering to lose.
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
}
