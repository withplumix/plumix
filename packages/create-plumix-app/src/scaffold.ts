import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import type { CatalogContext } from "./catalog.js";
import {
  EMPTY_CATALOG_CONTEXT,
  loadCatalogContext,
  rewritePackageJsonFile,
} from "./catalog.js";
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
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
const WORKSPACE_TEMPLATE = join(REPO_ROOT, "examples", "minimal");
const PUBLISHED_TEMPLATE = join(PACKAGE_ROOT, "templates", "starter");

// Use the workspace example only when we're actually inside the plumix
// monorepo — both the example and the catalog it resolves against must
// be present. Keying off the example alone would misfire if a published
// install happened to sit next to an unrelated `examples/minimal`.
export function resolveTemplateRoot(): string {
  return existsSync(WORKSPACE_TEMPLATE) &&
    existsSync(join(REPO_ROOT, "pnpm-workspace.yaml"))
    ? WORKSPACE_TEMPLATE
    : PUBLISHED_TEMPLATE;
}

// The workspace example's `package.json` uses pnpm's `workspace:*` and
// `catalog:` protocols, which only resolve inside the plumix monorepo —
// so we resolve them against the live catalog and sibling package
// versions at copy time. The published snapshot under `templates/starter`
// is already resolved at `prepack`, so it needs no catalog (empty
// context, no protocols left to rewrite).
function catalogContextFor(templateRoot: string): Promise<CatalogContext> {
  return templateRoot === WORKSPACE_TEMPLATE
    ? loadCatalogContext(REPO_ROOT)
    : Promise.resolve(EMPTY_CATALOG_CONTEXT);
}

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
  await rewritePackageJsonFile(
    join(targetDir, "package.json"),
    await catalogContextFor(source),
    (pkg) => {
      pkg.name = name;
    },
  );
  await writeScaffoldedTsconfig(targetDir);

  return { targetDir, name };
}

async function writeScaffoldedTsconfig(dir: string): Promise<void> {
  const tsconfigPath = join(dir, "tsconfig.json");
  await writeFile(
    tsconfigPath,
    `${JSON.stringify(SCAFFOLDED_TSCONFIG, null, 2)}\n`,
    "utf-8",
  );
}
