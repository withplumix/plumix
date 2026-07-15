import { existsSync, readdirSync, statSync } from "node:fs";
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
  // Migrations are committed per example, but a scaffolded project may
  // change its plugin set (hence its schema), so it generates its own
  // rather than inheriting the example's.
  "drizzle",
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
  readonly template?: string;
}

interface ScaffoldResult {
  readonly targetDir: string;
  readonly name: string;
}

export const DEFAULT_TEMPLATE = "minimal";

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(PACKAGE_ROOT, "..", "..");
// Templates are named after the `examples/*` they mirror. Inside the
// monorepo we copy the example directly so scaffolder output can never
// drift from it; published builds carry a resolved snapshot per example
// under `templates/<name>` (written at `prepack`).
const WORKSPACE_TEMPLATES = join(REPO_ROOT, "examples");
const PUBLISHED_TEMPLATES = join(PACKAGE_ROOT, "templates");

// We're in the monorepo when both the examples and the catalog they
// resolve against are present. Keying off the examples alone would
// misfire if a published install sat next to an unrelated `examples/`.
function inWorkspace(): boolean {
  return (
    existsSync(WORKSPACE_TEMPLATES) &&
    existsSync(join(REPO_ROOT, "pnpm-workspace.yaml"))
  );
}

function templatesRoot(): string {
  return inWorkspace() ? WORKSPACE_TEMPLATES : PUBLISHED_TEMPLATES;
}

/** Template names available to scaffold, in the current environment. */
export function availableTemplates(): string[] {
  return readdirSync(templatesRoot(), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

interface TemplateRoot {
  readonly root: string;
  readonly fromWorkspace: boolean;
}

export function resolveTemplateRoot(template: string): TemplateRoot {
  const available = availableTemplates();
  // Membership check rather than `existsSync(join(root, template))`: it
  // rejects an empty name (which would resolve to the templates dir
  // itself) and any `../` traversal out of it.
  if (!available.includes(template)) {
    throw ScaffoldError.unknownTemplate({ template, available });
  }
  return {
    root: join(templatesRoot(), template),
    fromWorkspace: inWorkspace(),
  };
}

// A workspace example's `package.json` uses pnpm's `workspace:*` and
// `catalog:` protocols, which only resolve inside the monorepo — so we
// resolve them against the live catalog at copy time. A published
// snapshot is already resolved at `prepack`, so it needs no catalog
// (empty context, no protocols left to rewrite).
function catalogContextFor(fromWorkspace: boolean): Promise<CatalogContext> {
  return fromWorkspace
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
  const { targetDir, template = DEFAULT_TEMPLATE } = options;
  // Resolve + validate first, so an unknown template fails before we
  // create the target directory.
  const { root, fromWorkspace } = resolveTemplateRoot(template);

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

  await cp(root, targetDir, {
    recursive: true,
    filter: (srcPath) => shouldCopyTemplateEntry(srcPath, root),
  });

  const name = basename(targetDir);
  await rewritePackageJsonFile(
    join(targetDir, "package.json"),
    await catalogContextFor(fromWorkspace),
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
