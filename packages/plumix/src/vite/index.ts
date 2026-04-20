import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import type { PlumixManifest } from "@plumix/core";
import {
  buildManifest,
  generateSchemaSource,
  generateWorkerSource,
  HookRegistry,
  injectManifestIntoHtml,
  installPlugins,
} from "@plumix/core";

import { loadConfig } from "../cli/load-config.js";

// `import.meta.url` for this module lives at plumix/dist/vite/index.js in
// consumer installs, so the pre-compiled admin artifact is a sibling at
// plumix/dist/admin-app. Computed once at module load.
const ADMIN_SOURCE_DIR = resolve(
  fileURLToPath(new URL(".", import.meta.url)),
  "../admin-app",
);

export interface PlumixVitePluginOptions {
  readonly configFile?: string;
}

export function plumix(options: PlumixVitePluginOptions = {}): Plugin {
  let root = process.cwd();
  let publicDir = "";
  let configPath: string | undefined;

  return {
    name: "plumix",
    // Default Vite's publicDir to .plumix/public so the admin staging path is
    // served automatically in the common case. Consumers with an explicit
    // publicDir in their vite.config keep theirs — plumix just namespaces
    // admin under `<their-publicDir>/_plumix/admin/` instead.
    config(userConfig) {
      if (userConfig.publicDir !== undefined) return;
      return { publicDir: ".plumix/public" };
    },
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
    },
    async buildStart() {
      const emitted = await regenerate(root, options.configFile);
      configPath = emitted.configPath;
      await stageAdminAssets(publicDir, emitted.manifest);
    },
    configureServer(server) {
      server.watcher.on("change", (path) => {
        if (!configPath || resolve(path) !== configPath) return;
        void regenerate(root, options.configFile)
          .then(async (emitted) => {
            await stageAdminAssets(publicDir, emitted.manifest);
            server.ws.send({ type: "full-reload" });
          })
          .catch((error: unknown) => {
            server.config.logger.error(
              `[plumix] failed to regenerate config on change: ${String(error)}`,
              { error: error instanceof Error ? error : undefined },
            );
          });
      });
    },
  };
}

/**
 * Pre-emit `.plumix/worker.ts` and `.plumix/schema.ts` from the user's
 * config. Exposed so the runtime adapter CLI can force the files into
 * existence before handing plugins to `vite.build` / `vite.createServer` —
 * peer plugins (notably @cloudflare/vite-plugin) validate wrangler.jsonc's
 * `main` path early, and expect that file to already exist.
 */
export async function emitPlumixSources(
  cwd: string,
  explicitConfig?: string,
): Promise<{ configPath: string }> {
  const { configPath } = await regenerate(cwd, explicitConfig);
  return { configPath };
}

async function regenerate(
  cwd: string,
  explicitConfig: string | undefined,
): Promise<{ configPath: string; manifest: PlumixManifest }> {
  const { config, configPath } = await loadConfig(cwd, explicitConfig);

  const schemaSource = generateSchemaSource(config).source;
  writeIfChanged(resolve(cwd, ".plumix/schema.ts"), schemaSource);

  const workerSource = generateWorkerSource({
    configModule: resolveConfigSpecifier(cwd, configPath),
  });
  writeIfChanged(resolve(cwd, ".plumix/worker.ts"), workerSource);

  const manifest = await computeManifest(config.plugins);

  return { configPath, manifest };
}

type PluginDescriptors = Parameters<typeof installPlugins>[0]["plugins"];

// Run plugin `setup()` callbacks into a throwaway hook registry just to
// capture what's been registered. The admin manifest only cares about the
// resulting post-type / taxonomy / meta snapshot — hooks wired up here are
// discarded. If a plugin throws on setup we surface it as-is: a broken
// config should fail the build, not silently ship an empty manifest.
// Note: plugin `setup()` callbacks run on every dev config-file change, so
// plugins should keep setup free of IO.
async function computeManifest(
  plugins: PluginDescriptors,
): Promise<PlumixManifest> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins,
  });
  return buildManifest(registry);
}

// Copies the compiled admin SPA from plumix/dist/admin-app into the effective
// publicDir under _plumix/admin/. The runtime adapter's asset-serving layer
// (Cloudflare Workers Assets today, equivalents in future adapters) picks the
// files up from publicDir automatically. Skips the bulk copy when the
// destination is already at least as fresh as the source so repeated
// regenerate() calls during dev don't bounce Vite's file watcher — but
// always rewrites `index.html` with the current manifest, since that one
// depends on consumer config rather than admin source mtime.
async function stageAdminAssets(
  publicDir: string,
  manifest: PlumixManifest,
): Promise<void> {
  const dest = resolve(publicDir, "_plumix/admin");
  if (!(await destIsFresh(dest, ADMIN_SOURCE_DIR))) {
    await rm(dest, { recursive: true, force: true });
    await cp(ADMIN_SOURCE_DIR, dest, { recursive: true });
  }
  await injectManifest(resolve(dest, "index.html"), manifest);
}

async function injectManifest(
  indexHtmlPath: string,
  manifest: PlumixManifest,
): Promise<void> {
  const html = await readFile(indexHtmlPath, "utf8");
  const next = injectManifestIntoHtml(html, manifest);
  if (next === html) return;
  await writeFile(indexHtmlPath, next, "utf8");
}

async function destIsFresh(dest: string, src: string): Promise<boolean> {
  // Dest-first: on the common cold-run case (dest doesn't exist) we skip the
  // src stat entirely; on warm runs we pay both stats sequentially, which is
  // dominated by filesystem cache anyway.
  let destStat: Awaited<ReturnType<typeof stat>>;
  try {
    destStat = await stat(dest);
  } catch {
    return false;
  }
  try {
    const srcStat = await stat(src);
    return destStat.mtimeMs >= srcStat.mtimeMs;
  } catch {
    return false;
  }
}

function writeIfChanged(path: string, content: string): void {
  try {
    if (existsSync(path) && readFileSync(path, "utf8") === content) return;
  } catch {
    // fall through to write
  }
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
}

function resolveConfigSpecifier(cwd: string, configPath: string): string {
  const rel = relative(resolve(cwd, ".plumix"), configPath).replace(/\\/g, "/");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

export { plumix as default };
