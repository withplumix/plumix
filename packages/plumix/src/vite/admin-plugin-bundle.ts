import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin as EsbuildPlugin } from "esbuild";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { build } from "esbuild";

import type {
  AnyPluginDescriptor,
  PluginRegistry,
  SharedAdminRuntimeSpecifier,
} from "@plumix/core";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "@plumix/core";

import type { BlockModuleRef } from "./block-module-resolver.js";
import {
  blockImportStatement,
  blockSpecsArrayExpr,
} from "./block-module-resolver.js";
import { VitePluginError } from "./errors.js";

// Bare imports of `react` etc. in the plugin source get aliased to
// `plumix/admin/<lib>` shims that read from `window.plumix.runtime.*`
// — single React instance across host + plugin.

/**
 * Must be absolute: index.html is served for every deep link, so a relative
 * chunk `src` resolves against the current URL and 404s.
 */
export const ADMIN_URL_PREFIX = "/_plumix/admin";

interface AssembledBundle {
  readonly chunkUrl: string;
  readonly cssUrl?: string;
}

/**
 * Relative to this file, not `node_modules/plumix`, so it works where the
 * consuming package doesn't declare `plumix` itself.
 */
const ADMIN_SHIM_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../admin",
);

/**
 * Resolve the `@theme` mapping from the installed @plumix/admin (same
 * package.json lookup index.ts uses to stage the SPA) so the per-plugin
 * sidecar compiles against the exact admin the consumer runs.
 */
const require = createRequire(import.meta.url);
const ADMIN_THEME_CSS = resolve(
  dirname(require.resolve("@plumix/admin/package.json")),
  "dist/theme.css",
);
/**
 * Tailwind is plumix's dependency, not the site's; resolved from the site root
 * it is missing under `bun --bun`.
 */
const TAILWIND_THEME_CSS = require.resolve("tailwindcss/theme.css");
const TAILWIND_UTILITIES_CSS = require.resolve("tailwindcss/utilities.css");

export async function assemblePluginAdminBundle({
  plugins,
  registry,
  adminDest,
  projectRoot,
  blockModules = [],
}: {
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly registry: PluginRegistry;
  readonly adminDest: string;
  readonly projectRoot: string;
  readonly blockModules?: readonly BlockModuleRef[];
}): Promise<AssembledBundle | null> {
  const withEntry = plugins.filter(
    (p): p is AnyPluginDescriptor & { adminEntry: string } =>
      typeof p.adminEntry === "string" && p.adminEntry.length > 0,
  );
  // The bundle also carries theme/plugin block registrations, so build it when
  // there are blocks even if no plugin declares an `adminEntry`.
  if (withEntry.length === 0 && blockModules.length === 0) return null;

  for (const p of withEntry) {
    if (p.adminChunk) {
      throw VitePluginError.adminEntryAndChunkBothSet({ pluginId: p.id });
    }
  }

  const cacheDir = resolve(projectRoot, ".plumix");
  await mkdir(cacheDir, { recursive: true });

  // Namespace imports still execute module bodies, so imperative
  // `window.plumix.register*` calls at eval time keep working.
  const resolvedEntries = await Promise.all(
    withEntry.map((p) => resolveAndValidateEntry(p, projectRoot)),
  );

  const synthesisedEntry = buildSynthesisedEntry({
    plugins: withEntry,
    resolvedEntries,
    registry,
    blockModules,
  });

  const entryFile = resolve(cacheDir, "admin-plugins-entry.mjs");
  await writeFile(entryFile, `${synthesisedEntry}\n`);

  const pluginsOutDir = resolve(adminDest, "plugins");
  await mkdir(pluginsOutDir, { recursive: true });

  await build({
    entryPoints: [entryFile],
    outfile: resolve(pluginsOutDir, "site-bundle.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    // Preserves class identifiers through minification. The error-class
    // `static {}` blocks already pin `error.name` to a string literal,
    // but `error.constructor.name` would otherwise surface the mangled
    // identifier (`class PasskeyError` → `class e`).
    keepNames: true,
    legalComments: "none",
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [pluginRuntimeAliasPlugin()],
    nodePaths: [resolve(projectRoot, "node_modules")],
    absWorkingDir: projectRoot,
    // A plugin's `"sideEffects": false` would let esbuild tree-shake its
    // side-effect-only admin entry into a 0-byte bundle.
    ignoreAnnotations: true,
  });

  const cssUrl = await compilePluginCss({
    sourceDirs: resolvedEntries.map((entry) => dirname(entry)),
    outFile: resolve(pluginsOutDir, "site-bundle.css"),
    projectRoot,
  });

  return {
    chunkUrl: `${ADMIN_URL_PREFIX}/plugins/site-bundle.js`,
    cssUrl: cssUrl ? `${ADMIN_URL_PREFIX}/plugins/site-bundle.css` : undefined,
  };
}

/**
 * The `window.plumix` guard covers a host bundle that errored mid-init;
 * normally it is populated before plugin chunks run.
 */
function buildSynthesisedEntry({
  plugins,
  resolvedEntries,
  registry,
  blockModules,
}: {
  readonly plugins: readonly (AnyPluginDescriptor & { adminEntry: string })[];
  readonly resolvedEntries: readonly string[];
  readonly registry: PluginRegistry;
  readonly blockModules: readonly BlockModuleRef[];
}): string {
  const importLines: string[] = [];
  const registerLines: string[] = [];

  // From the same source the canvas uses, so a plugin declares its blocks once,
  // in `setup`.
  blockModules.forEach((ref, i) => {
    const local = `b_${i}`;
    importLines.push(blockImportStatement(ref, local));
    registerLines.push(
      `  for (const s of ${blockSpecsArrayExpr(local)}) __plumix.registerPluginBlock(s);`,
    );
  });

  plugins.forEach((plugin, idx) => {
    const ns = `p_${plugin.id}`;
    const entryPath = resolvedEntries[idx];
    if (entryPath === undefined) return;
    importLines.push(`import * as ${ns} from ${JSON.stringify(entryPath)};`);

    for (const page of registry.adminPages.values()) {
      if (page.registeredBy !== plugin.id) continue;
      registerLines.push(
        `  __plumix.registerPluginPage(${JSON.stringify(page.path)}, ` +
          `${ns}[${JSON.stringify(page.component)}]);`,
      );
    }
    for (const fieldType of registry.fieldTypes.values()) {
      if (fieldType.registeredBy !== plugin.id) continue;
      registerLines.push(
        `  __plumix.registerPluginFieldType(${JSON.stringify(fieldType.type)}, ` +
          `${ns}[${JSON.stringify(fieldType.component)}]);`,
      );
    }
    for (const mark of registry.markSpecs.values()) {
      if (mark.registeredBy !== plugin.id) continue;
      if (mark.spec.adminSchema !== undefined) {
        registerLines.push(
          `  __plumix.registerPluginMarkSchema(${JSON.stringify(mark.spec.name)}, ` +
            `${ns}[${JSON.stringify(mark.spec.adminSchema)}]);`,
        );
      }
    }
  });

  if (registerLines.length === 0) {
    // No declarative registrations — but the namespace imports still
    // run module bodies for any plugin that registers imperatively.
    return importLines.join("\n");
  }

  return [
    ...importLines,
    "",
    "const __plumix = window.plumix;",
    "if (__plumix) {",
    ...registerLines,
    "}",
  ].join("\n");
}

/**
 * Only the utilities plugin source uses; the host admin's `globals.css` already
 * ships preflight and the design tokens.
 */
async function compilePluginCss({
  sourceDirs,
  outFile,
  projectRoot,
}: {
  readonly sourceDirs: readonly string[];
  readonly outFile: string;
  readonly projectRoot: string;
}): Promise<boolean> {
  const themeCss = await readFile(ADMIN_THEME_CSS, "utf8").catch(() => null);
  if (themeCss === null) {
    // `@plumix/admin` isn't built yet in a workspace dev run; production
    // installs always ship it.
    return false;
  }

  // `@source` directories must exist or Tailwind's Scanner throws.
  const sourceLines = sourceDirs
    .map((d) => `@source ${JSON.stringify(d)};`)
    .join("\n");

  // A dedicated lowest-priority layer, so a plugin re-emitting a base utility
  // like `.hidden` can't override the admin's own.
  const input = [
    `@import ${JSON.stringify(TAILWIND_THEME_CSS)} layer(theme);`,
    `@import ${JSON.stringify(TAILWIND_UTILITIES_CSS)} layer(plumix-plugins);`,
    themeCss,
    sourceLines,
  ].join("\n");

  const compiler = await compile(input, {
    base: projectRoot,
    onDependency: () => {
      // Vite's own watcher picks up config and plugin source edits, so
      // Tailwind's hints are unused.
    },
  });
  const scanner = new Scanner({ sources: compiler.sources });
  const candidates = scanner.scan();
  if (candidates.length === 0) return false;

  const built = compiler.build(candidates);
  const minified = optimize(built, { minify: true }).code;
  await writeFile(outFile, minified, "utf8");
  return true;
}

export async function resolveAndValidateEntry(
  plugin: AnyPluginDescriptor & { adminEntry: string },
  projectRoot: string,
): Promise<string> {
  const resolved = isAbsolute(plugin.adminEntry)
    ? plugin.adminEntry
    : resolve(projectRoot, plugin.adminEntry);

  // Plugin descriptors come from npm packages the consumer doesn't fully
  // control; reject an `adminEntry` escaping the project root.
  const rel = relative(projectRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw VitePluginError.adminEntryOutsideProjectRoot({
      pluginId: plugin.id,
      adminEntry: plugin.adminEntry,
      resolved,
    });
  }

  try {
    await stat(resolved);
  } catch {
    throw VitePluginError.adminEntryNotFound({
      pluginId: plugin.id,
      adminEntry: plugin.adminEntry,
      resolved,
    });
  }

  return resolved;
}

/**
 * Each shared specifier resolves to an absolute file path under the
 * `../admin/` sibling — works for both the published tarball and the
 * workspace symlink without consulting node_modules.
 */
const SHIM_PATHS: Readonly<Record<string, string>> = Object.fromEntries(
  Object.keys(SHARED_ADMIN_RUNTIME_SPECIFIERS).map((spec) => {
    const slug = adminRuntimeShimSlug(spec as SharedAdminRuntimeSpecifier);
    return [spec, resolve(ADMIN_SHIM_DIR, `${slug}.js`)];
  }),
);

function pluginRuntimeAliasPlugin(): EsbuildPlugin {
  return {
    name: "plumix:plugin-runtime-alias",
    setup(buildApi) {
      buildApi.onResolve({ filter: /.*/ }, (args) => {
        const target = SHIM_PATHS[args.path];
        if (target === undefined) return null;
        return { path: target };
      });
    },
  };
}
