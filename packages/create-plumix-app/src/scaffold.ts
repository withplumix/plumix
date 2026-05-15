import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { ScaffoldError } from "./errors.js";

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

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// Single source of truth: inside the plumix workspace we copy directly
// from the `examples/minimal` package so the scaffolder output can
// never drift from the canonical example. Published builds carry a
// snapshot under `templates/starter/` (written at `prepack` time)
// that's used when the workspace example isn't reachable.
const WORKSPACE_TEMPLATE = join(
  PACKAGE_ROOT,
  "..",
  "..",
  "examples",
  "minimal",
);
const PUBLISHED_TEMPLATE = join(PACKAGE_ROOT, "templates", "starter");

export function resolveTemplateRoot(): string {
  return existsSync(WORKSPACE_TEMPLATE)
    ? WORKSPACE_TEMPLATE
    : PUBLISHED_TEMPLATE;
}

// The example's `package.json` uses pnpm's `workspace:*` and `catalog:`
// protocols, which only resolve inside the plumix monorepo. End-user
// projects need concrete SemVer ranges, so we rewrite at copy time.
// Bump these together with the corresponding workspace catalog
// (`pnpm-workspace.yaml`) and the next plumix release.
const PLUMIX_PACKAGE_VERSION = "^0.1.0";
const CATALOG_RESOLUTIONS: Record<string, string> = {
  "@cloudflare/workers-types": "^4.20260421.1",
  "@types/node": "^24.12.2",
  typescript: "^6.0.3",
  wrangler: "^4.86.0",
};

// `@plumix/typescript-config` is a private dev-only workspace package,
// not published to npm. The example's tsconfig `extends` it; the
// scaffolded project gets a self-contained equivalent instead.
const TYPESCRIPT_CONFIG_PKG = "@plumix/typescript-config";

const SCAFFOLDED_TSCONFIG = {
  $schema: "https://json.schemastore.org/tsconfig",
  compilerOptions: {
    esModuleInterop: true,
    skipLibCheck: true,
    target: "ES2022",
    lib: ["ES2022", "WebWorker"],
    allowJs: true,
    resolveJsonModule: true,
    moduleDetection: "force",
    isolatedModules: true,
    verbatimModuleSyntax: true,
    strict: true,
    noUncheckedIndexedAccess: true,
    noImplicitOverride: true,
    module: "Preserve",
    moduleResolution: "Bundler",
    noEmit: true,
    types: ["node", "@cloudflare/workers-types"],
  },
  include: ["plumix.config.ts", ".plumix"],
  exclude: ["node_modules", "dist"],
};

export async function scaffold(
  options: ScaffoldOptions,
): Promise<ScaffoldResult> {
  const { targetDir } = options;
  const parent = dirname(targetDir);
  if (!existsSync(parent)) {
    throw ScaffoldError.targetParentMissing({ parent });
  }

  if (existsSync(targetDir)) {
    if (!statSync(targetDir).isDirectory()) {
      throw ScaffoldError.targetNotDirectory({ targetDir });
    }
    const entries = await readdir(targetDir);
    if (entries.length > 0) {
      throw ScaffoldError.targetDirectoryNotEmpty({ targetDir });
    }
  } else {
    await mkdir(targetDir);
  }

  const source = resolveTemplateRoot();
  await cp(source, targetDir, {
    recursive: true,
    filter: (srcPath) => shouldCopyTemplateEntry(srcPath, source),
  });

  const name = basename(targetDir);
  await rewritePackageJson(targetDir, name);
  await writeScaffoldedTsconfig(targetDir);

  return { targetDir, name };
}

interface PackageJsonShape {
  name: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

export function rewriteDeps(
  deps: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!deps) return deps;
  const out: Record<string, string> = {};
  for (const [name, range] of Object.entries(deps)) {
    if (name === TYPESCRIPT_CONFIG_PKG) continue;
    if (range.startsWith("workspace:")) {
      out[name] = PLUMIX_PACKAGE_VERSION;
      continue;
    }
    if (range.startsWith("catalog:")) {
      const resolved = CATALOG_RESOLUTIONS[name];
      if (!resolved) {
        throw ScaffoldError.catalogResolutionMissing({ catalogName: name });
      }
      out[name] = resolved;
      continue;
    }
    out[name] = range;
  }
  return out;
}

async function rewritePackageJson(dir: string, name: string): Promise<void> {
  const pkgPath = join(dir, "package.json");
  const raw = await readFile(pkgPath, "utf-8");
  const pkg = JSON.parse(raw) as PackageJsonShape;
  pkg.name = name;
  const deps = rewriteDeps(pkg.dependencies);
  const devDeps = rewriteDeps(pkg.devDependencies);
  if (deps) pkg.dependencies = deps;
  if (devDeps) pkg.devDependencies = devDeps;
  // 2-space indent + trailing newline matches the rest of the
  // template's JSON files. JSON.stringify rewrites the whole file —
  // fine because the template's package.json is plain JSON we control,
  // no comments or custom key ordering to lose.
  await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf-8");
}

async function writeScaffoldedTsconfig(dir: string): Promise<void> {
  const tsconfigPath = join(dir, "tsconfig.json");
  await writeFile(
    tsconfigPath,
    `${JSON.stringify(SCAFFOLDED_TSCONFIG, null, 2)}\n`,
    "utf-8",
  );
}
