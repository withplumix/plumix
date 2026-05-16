import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { SharedAdminRuntimeSpecifier } from "../../admin/runtime.js";
import {
  adminRuntimeShimSlug,
  SHARED_ADMIN_RUNTIME_SPECIFIERS,
} from "../../admin/runtime.js";

export interface BuildAdminPluginChunkOptions {
  /** Source entry point (e.g. the plugin's `src/admin/index.tsx`). */
  readonly entryPoint: string;
  /** Path to admin's built `dist/` directory; the chunk is dropped here. */
  readonly adminDist: string;
  /** Path to `packages/plumix/src/admin/` so the alias seam can resolve shims. */
  readonly plumixAdminSrc: string;
  /** Unique data attribute on the injected script tag (e.g. `data-plumix-e2e`). */
  readonly scriptMarker: string;
  /** Log prefix for the success message (e.g. `[e2e/runtime-proof] fixture plugin`). */
  readonly logTag: string;
}

/**
 * Build a plugin's admin chunk into admin's preview dist using the same
 * alias seam plumix's vite plugin uses at consumer build time, then patch
 * `index.html` to load it. Used by e2e fixtures in admin and plugins.
 *
 * `esbuild` is dynamically imported so this module is free to ship inside
 * `@plumix/core/test/playwright` without forcing every consumer to have
 * esbuild installed — only the e2e build steps that call this function
 * need it.
 */
export async function buildAdminPluginChunkForE2E(
  options: BuildAdminPluginChunkOptions,
): Promise<void> {
  const { build } = await import("esbuild");

  const shimPaths = Object.fromEntries(
    Object.keys(SHARED_ADMIN_RUNTIME_SPECIFIERS).map((spec) => {
      const slug = adminRuntimeShimSlug(spec as SharedAdminRuntimeSpecifier);
      return [spec, resolve(options.plumixAdminSrc, `${slug}.ts`)];
    }),
  );

  const pluginsOutDir = resolve(options.adminDist, "plugins");
  await mkdir(pluginsOutDir, { recursive: true });

  await build({
    entryPoints: [options.entryPoint],
    outfile: resolve(pluginsOutDir, "site-bundle.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    jsx: "automatic",
    minify: true,
    // Match the production plugin-chunk builder (admin-plugin-bundle.ts):
    // preserve class identifiers so e2e fixtures see the same
    // `error.constructor.name` value the host build would produce.
    keepNames: true,
    legalComments: "none",
    logLevel: "warning",
    define: { "process.env.NODE_ENV": '"production"' },
    plugins: [
      {
        name: "plumix:admin-runtime-alias",
        setup(buildApi) {
          buildApi.onResolve({ filter: /.*/ }, (args) => {
            const target = shimPaths[args.path];
            if (target === undefined) return null;
            return { path: target };
          });
        },
      },
    ],
  });

  const indexHtmlPath = resolve(options.adminDist, "index.html");
  let html = await readFile(indexHtmlPath, "utf8");
  const tag = `<script type="module" ${options.scriptMarker} src="/_plumix/admin/plugins/site-bundle.js"></script>`;
  if (!html.includes(options.scriptMarker)) {
    html = html.replace("</body>", `${tag}\n</body>`);
    await writeFile(indexHtmlPath, html);
  }

  console.log(`${options.logTag} assembled + injected`);
}
