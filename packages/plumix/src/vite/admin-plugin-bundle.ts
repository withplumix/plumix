import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin as VitePlugin } from "vite";
import { compile, optimize } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { build } from "vite";

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
import { authMethodClientsSource } from "./auth-method-clients-codegen.js";
import {
  blockImportStatement,
  blockSpecsArrayExpr,
} from "./block-module-resolver.js";
import { VitePluginError } from "./errors.js";
import { withoutUseClientWarning } from "./use-client-warning.js";

// Bare imports of `react` etc. in the plugin source get aliased to
// `plumix/admin/<lib>` shims that read from `window.plumix.runtime.*`
// — single React instance across host + plugin.

/** Files staged under the admin's `plugins/` folder. */
interface AssembledBundle {
  readonly chunkFile: string;
  readonly cssFile?: string;
  /** The files it was built from, which a dev server watches. */
  readonly sourceFiles: readonly string[];
}

/**
 * Relative to this file, not `node_modules/plumix`, so it works where the
 * consuming package doesn't declare `plumix` itself.
 */
const ADMIN_SHIM_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../admin",
);

/** The shims' extension matches this module's: `.ts` when run from source. */
const ADMIN_SHIM_EXT = import.meta.url.endsWith(".ts") ? ".ts" : ".js";

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
  themeCssPath = ADMIN_THEME_CSS,
}: {
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly registry: PluginRegistry;
  readonly adminDest: string;
  readonly projectRoot: string;
  readonly blockModules?: readonly BlockModuleRef[];
  /** The stylesheet whose `@theme` the sidecar compiles against. */
  readonly themeCssPath?: string;
}): Promise<AssembledBundle | null> {
  const withEntry = plugins.filter(
    (p): p is AnyPluginDescriptor & { adminEntry: string } =>
      typeof p.adminEntry === "string" && p.adminEntry.length > 0,
  );
  const cacheDir = resolve(projectRoot, ".plumix");
  // Mounts each sign-in method's client half on the host's `authClient`
  // through the `plumix/admin/auth-client` shim.
  const methodClients = authMethodClientsSource(cacheDir, plugins);
  // The bundle also carries theme/plugin block registrations and method
  // clients, so build it for either even if no plugin declares an `adminEntry`.
  if (
    withEntry.length === 0 &&
    blockModules.length === 0 &&
    methodClients === ""
  ) {
    return null;
  }

  for (const p of withEntry) {
    if (p.adminChunk) {
      throw VitePluginError.adminEntryAndChunkBothSet({ pluginId: p.id });
    }
  }

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
  await writeFile(entryFile, `${synthesisedEntry}\n${methodClients}`);

  const pluginsOutDir = resolve(adminDest, "plugins");
  await mkdir(pluginsOutDir, { recursive: true });

  const output = await build({
    configFile: false,
    envDir: false,
    root: projectRoot,
    publicDir: false,
    logLevel: "warn",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      pluginRuntimeAliasPlugin(),
      keepAdminEntriesPlugin(resolvedEntries),
    ],
    build: {
      outDir: pluginsOutDir,
      emptyOutDir: false,
      target: "es2022",
      minify: true,
      reportCompressedSize: false,
      rolldownOptions: {
        input: entryFile,
        onLog: withoutUseClientWarning(undefined),
        output: {
          format: "es",
          entryFileNames: "site-bundle.js",
          // One file, which `index.html` names.
          codeSplitting: false,
          // `error.constructor.name` would otherwise surface the mangled
          // identifier (`class PasskeyError` → `class e`).
          keepNames: true,
          // Vite drops them on minify; this bundle carries its notices inline
          // (ADR 0043).
          comments: { legal: true },
        },
      },
    },
  });

  const hasCss = await compilePluginCss({
    sourceDirs: resolvedEntries.map((entry) => dirname(entry)),
    outFile: resolve(pluginsOutDir, "site-bundle.css"),
    projectRoot,
    themeCssPath,
  });

  return {
    chunkFile: "site-bundle.js",
    cssFile: hasCss ? "site-bundle.css" : undefined,
    sourceFiles: bundledSourceFiles(output, entryFile),
  };
}

/** Installed packages left out: nobody edits them under a dev server. */
function bundledSourceFiles(
  output: Awaited<ReturnType<typeof build>>,
  entryFile: string,
): string[] {
  const outputs = Array.isArray(output)
    ? output
    : "output" in output
      ? [output]
      : [];
  return outputs
    .flatMap(({ output: files }) =>
      files.flatMap((file) => (file.type === "chunk" ? file.moduleIds : [])),
    )
    .filter(
      (id) =>
        isAbsolute(id) &&
        id !== entryFile &&
        !id.includes(`${sep}node_modules${sep}`),
    );
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
    for (const widget of registry.dashboardWidgets.values()) {
      if (widget.registeredBy !== plugin.id) continue;
      registerLines.push(
        `  __plumix.registerPluginDashboardWidget(${JSON.stringify(widget.id)}, ` +
          `${ns}[${JSON.stringify(widget.component)}]);`,
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
  themeCssPath,
}: {
  readonly sourceDirs: readonly string[];
  readonly outFile: string;
  readonly projectRoot: string;
  readonly themeCssPath: string;
}): Promise<boolean> {
  const themeCss = await readFile(themeCssPath, "utf8").catch(() => null);
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
    return [spec, resolve(ADMIN_SHIM_DIR, `${slug}${ADMIN_SHIM_EXT}`)];
  }),
);

function pluginRuntimeAliasPlugin(): VitePlugin {
  return {
    name: "plumix:plugin-runtime-alias",
    // Ahead of Vite's resolver, which would find the package itself.
    enforce: "pre",
    resolveId(source) {
      return SHIM_PATHS[source] ?? null;
    },
  };
}

/**
 * A plugin's `"sideEffects": false` would tree-shake its side-effect-only
 * admin entry away. Overriding only the entries keeps the flag pruning
 * their dependencies, such as an icon barrel.
 */
function keepAdminEntriesPlugin(entries: readonly string[]): VitePlugin {
  const entrySet = new Set(entries);
  return {
    name: "plumix:keep-admin-entries",
    enforce: "pre",
    async resolveId(source, importer, options) {
      if (!entrySet.has(source)) return null;
      // Vite's own resolution, so a workspace plugin's entry gets its real
      // path rather than the `node_modules` link to it.
      const resolved = await this.resolve(source, importer, {
        ...options,
        skipSelf: true,
      });
      return resolved && { ...resolved, moduleSideEffects: true };
    },
  };
}
