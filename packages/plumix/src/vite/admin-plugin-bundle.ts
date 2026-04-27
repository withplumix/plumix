import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

// Bare imports of `react` etc. in the plugin source get aliased to
// `plumix/admin/<lib>` shims that read from `window.plumix.runtime.*`
// — single React instance across host + plugin.

interface AssembledBundle {
  readonly chunkUrl: string;
  readonly cssUrl?: string;
}

// Resolve shim targets relative to this file rather than via the
// consumer's `node_modules/plumix` lookup. This module always lives
// next to its sibling `../admin/<lib>.js`, whether shipped from the
// published `plumix` tarball or from a workspace symlink. Side effect:
// the assembler works in monorepos where the consuming package doesn't
// declare `plumix` as its own dep.
const ADMIN_SHIM_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../admin",
);

// Sibling of the runtime shims — `dist/admin/theme.css` is copied here
// at plumix build time by `scripts/copy-admin.mjs` (see).
const ADMIN_THEME_CSS = resolve(ADMIN_SHIM_DIR, "theme.css");

export async function assemblePluginAdminBundle({
  plugins,
  registry,
  adminDest,
  projectRoot,
}: {
  readonly plugins: readonly AnyPluginDescriptor[];
  readonly registry: PluginRegistry;
  readonly adminDest: string;
  readonly projectRoot: string;
}): Promise<AssembledBundle | null> {
  const withEntry = plugins.filter(
    (p): p is AnyPluginDescriptor & { adminEntry: string } =>
      typeof p.adminEntry === "string" && p.adminEntry.length > 0,
  );
  if (withEntry.length === 0) return null;

  for (const p of withEntry) {
    if (p.adminChunk) {
      throw new Error(
        `[plumix] plugin "${p.id}" sets both adminEntry and adminChunk. ` +
          `Pick one — adminEntry (TS source) is preferred.`,
      );
    }
  }

  const cacheDir = resolve(projectRoot, ".plumix");
  await mkdir(cacheDir, { recursive: true });

  // Synthesised entry: namespace-import each plugin's adminEntry, then
  // emit `window.plumix.registerPlugin{Page,Block,FieldType}` calls for
  // every surface the plugin's `setup()` registered. The plugin author
  // exports `MediaLibrary` (etc.) and writes one `ctx.registerAdminPage
  // ({ component: "MediaLibrary" })` line — the boilerplate that used to
  // live in the plugin's `admin/index.tsx` (Window typing, registry
  // call) is generated here, where it's correct by construction.
  //
  // Namespace imports still execute the module body, so any imperative
  // `window.plumix.register*` calls a plugin chooses to make at module-
  // eval time keep working. Plugins are imported in declared order;
  // duplicate paths/names throw at admin runtime via the registry's
  // first-writer-wins guard.
  const resolvedEntries = await Promise.all(
    withEntry.map((p) => resolveAndValidateEntry(p, projectRoot)),
  );

  const synthesisedEntry = buildSynthesisedEntry({
    plugins: withEntry,
    resolvedEntries,
    registry,
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
    legalComments: "none",
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [pluginRuntimeAliasPlugin()],
    nodePaths: [resolve(projectRoot, "node_modules")],
    absWorkingDir: projectRoot,
    // Plugin admin entries are bare `import "..."` for the
    // module-eval side effect (`window.plumix.registerPluginPage`).
    // A plugin's `package.json` `"sideEffects": false` would let
    // esbuild tree-shake the entire import — silently producing a
    // 0-byte bundle. Ignore those annotations for this build.
    ignoreAnnotations: true,
  });

  const cssUrl = await compilePluginCss({
    sourceDirs: resolvedEntries.map((entry) => dirname(entry)),
    outFile: resolve(pluginsOutDir, "site-bundle.css"),
    projectRoot,
  });

  return {
    chunkUrl: "./plugins/site-bundle.js",
    cssUrl: cssUrl ? "./plugins/site-bundle.css" : undefined,
  };
}

// Build the synthesised JS entry the bundler ingests. One namespace
// import per plugin (`p_<id>` — plugin ids are `[a-z][a-z0-9_]*`, so
// the prefix-and-id form is always a valid identifier), followed by a
// flat list of `registerPlugin*` calls keyed off the plugin id and the
// `component` export name from each registered surface.
//
// Window-presence guard: the host admin's main bundle runs
// `bootPlumixGlobals()` synchronously on module-eval, and plugin chunks
// load AFTER it in document order — so `window.plumix` is always
// populated by the time this entry runs. The `if` is belt-and-braces
// for the unusual case where the host bundle errored out mid-init.
function buildSynthesisedEntry({
  plugins,
  resolvedEntries,
  registry,
}: {
  readonly plugins: readonly (AnyPluginDescriptor & { adminEntry: string })[];
  readonly resolvedEntries: readonly string[];
  readonly registry: PluginRegistry;
}): string {
  const importLines: string[] = [];
  const registerLines: string[] = [];

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
    for (const block of registry.blocks.values()) {
      if (block.registeredBy !== plugin.id || !block.component) continue;
      registerLines.push(
        `  __plumix.registerPluginBlock(${JSON.stringify(block.name)}, ` +
          `${ns}[${JSON.stringify(block.component)}]);`,
      );
    }
    for (const fieldType of registry.fieldTypes.values()) {
      if (fieldType.registeredBy !== plugin.id) continue;
      registerLines.push(
        `  __plumix.registerPluginFieldType(${JSON.stringify(fieldType.type)}, ` +
          `${ns}[${JSON.stringify(fieldType.component)}]);`,
      );
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

// Tailwind v4 compile of the union of plugin source directories. The
// host admin's `globals.css` ships preflight + design-token vars on
// every page; this sidecar adds only the utility classes plugin source
// actually uses, mapped to the same vars via the shared `theme.css`.
// Returns `false` if no candidates were found (no CSS file emitted, no
// `<link>` injected — keeps the HTML clean for plugins that don't ship
// any UI).
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
    // Workspace dev: theme.css hasn't been copied into dist/admin yet
    // (the consumer is running against the source tree). Skip the
    // compile rather than failing — plugin authors testing with
    // `pnpm dev` see the host admin's CSS but not the per-plugin
    // utilities. Production builds always have theme.css present.
    return false;
  }

  // `@source` directives must point at directories that exist; missing
  // dirs would make the Scanner throw. `dirname(adminEntry)` always
  // exists by the time this runs (we just resolved the entry path),
  // but a plugin could declare an entry at the package root with no
  // sibling components — Tailwind handles empty scans fine.
  const sourceLines = sourceDirs
    .map((d) => `@source ${JSON.stringify(d)};`)
    .join("\n");

  const input = [
    `@import "tailwindcss/theme" layer(theme);`,
    `@import "tailwindcss/utilities" layer(utilities);`,
    themeCss,
    sourceLines,
  ].join("\n");

  const compiler = await compile(input, {
    base: projectRoot,
    onDependency: () => {
      // Vite watches plumix.config.ts and re-runs `regenerate()` on
      // change; per-plugin source edits are picked up by Vite's own
      // watcher when the plugin source lives in the project tree. No
      // need to forward Tailwind's dependency hints — the rebuild
      // path doesn't poll Tailwind separately.
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

  // Containment check: reject paths that escape the project root.
  // Plugin descriptors can come from npm packages that the consumer
  // has installed but doesn't fully control — guard against malicious
  // or buggy `adminEntry` values pulling in arbitrary files.
  const rel = relative(projectRoot, resolved);
  if (rel.startsWith("..") || isAbsolute(rel)) {
    throw new Error(
      `[plumix] plugin "${plugin.id}" adminEntry "${plugin.adminEntry}" ` +
        `resolves outside the project root (${resolved}). Plugin admin ` +
        `entries must live inside the consumer site's directory tree.`,
    );
  }

  try {
    await stat(resolved);
  } catch {
    throw new Error(
      `[plumix] plugin "${plugin.id}" declares adminEntry ` +
        `"${plugin.adminEntry}" but the file was not found at ${resolved}.`,
    );
  }

  return resolved;
}

// Each shared specifier resolves to an absolute file path under the
// `../admin/` sibling — works for both the published tarball and the
// workspace symlink without consulting node_modules.
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
