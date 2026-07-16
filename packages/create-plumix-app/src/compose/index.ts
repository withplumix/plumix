import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";

import type { CatalogContext } from "../catalog.js";
import type { PackageJson } from "./package-json.js";
import type { Selection } from "./types.js";
import { assembleConfig } from "./config.js";
import { assembleRuntimeFiles } from "./files.js";
import { assemblePackageJson } from "./package-json.js";
import { fillProjectName } from "./types.js";

export type ComposedFiles = Record<string, string>;

interface ComposeOptions {
  readonly selection: Selection;
  /** Directory holding the runtime-agnostic base skeleton. */
  readonly baseDir: string;
  readonly ctx: CatalogContext;
}

// npm renames a published `.gitignore` to `.npmignore`, so the base ships
// it dotless and we restore the dot on write.
const GITIGNORE_SOURCE = "gitignore";

const TSCONFIG = {
  $schema: "https://json.schemastore.org/tsconfig",
  compilerOptions: {
    esModuleInterop: true,
    skipLibCheck: true,
    target: "ES2022",
    lib: ["ES2022", "WebWorker"],
    jsx: "react",
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
    types: ["node", "@cloudflare/workers-types", "react"],
  },
  include: ["plumix.config.ts", "theme", ".plumix"],
  exclude: ["node_modules", "dist"],
};

/**
 * Produce the complete set of files for a scaffolded project as a
 * path → content map. The runtime-agnostic base tree is read and
 * project-name-substituted; the config, package.json, runtime files and
 * tsconfig are assembled from the selection. The caller just writes them.
 */
export async function compose({
  selection,
  baseDir,
  ctx,
}: ComposeOptions): Promise<ComposedFiles> {
  const { projectName } = selection;
  const out: ComposedFiles = {};

  let basePkgRaw = "{}";
  for (const [rel, content] of await readBaseFiles(baseDir)) {
    if (rel === "package.json") {
      basePkgRaw = content; // assembled below, not copied verbatim
      continue;
    }
    const dest = rel === GITIGNORE_SOURCE ? ".gitignore" : rel;
    out[dest] = fillProjectName(content, projectName);
  }

  // Runtime files first, so the core-assembled files below always win a
  // key collision (a runtime must not shadow package.json / config / tsconfig).
  Object.assign(out, assembleRuntimeFiles(selection));
  out["package.json"] = assemblePackageJson(
    selection,
    JSON.parse(basePkgRaw) as PackageJson,
    ctx,
  );
  out["plumix.config.ts"] = assembleConfig(selection);
  out["tsconfig.json"] = `${JSON.stringify(TSCONFIG, null, 2)}\n`;

  return out;
}

async function readBaseFiles(baseDir: string): Promise<[string, string][]> {
  const entries = await readdir(baseDir, {
    recursive: true,
    withFileTypes: true,
  });
  const files: [string, string][] = [];
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const abs = join(entry.parentPath, entry.name);
    const rel = relative(baseDir, abs).split(sep).join("/");
    files.push([rel, await readFile(abs, "utf8")]);
  }
  return files;
}
