import { mkdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin as EsbuildPlugin } from "esbuild";
import { build } from "esbuild";

import type {
  AnyPluginDescriptor,
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

export async function assemblePluginAdminBundle({
  plugins,
  adminDest,
  projectRoot,
}: {
  readonly plugins: readonly AnyPluginDescriptor[];
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

  // Synthesised entry: side-effect import each plugin's adminEntry so
  // its module-eval `window.plumix.registerPluginPage(...)` fires once
  // the bundle loads. Plugins are imported in declared order — first
  // registration wins on conflicts (the registry throws on duplicate
  // paths, surfacing the conflict rather than silently overwriting).
  const resolvedEntries = await Promise.all(
    withEntry.map((p) => resolveAndValidateEntry(p, projectRoot)),
  );
  const synthesisedEntry = resolvedEntries
    .map((path) => `import ${JSON.stringify(path)};`)
    .join("\n");

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

  return { chunkUrl: "./plugins/site-bundle.js" };
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
