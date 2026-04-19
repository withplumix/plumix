import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, rm, stat } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import { generateSchemaSource, generateWorkerSource } from "@plumix/core";

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
      await stageAdminAssets(publicDir);
    },
    configureServer(server) {
      server.watcher.on("change", (path) => {
        if (!configPath || resolve(path) !== configPath) return;
        void regenerate(root, options.configFile).then(() => {
          server.ws.send({ type: "full-reload" });
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
  return regenerate(cwd, explicitConfig);
}

async function regenerate(
  cwd: string,
  explicitConfig: string | undefined,
): Promise<{ configPath: string }> {
  const { config, configPath } = await loadConfig(cwd, explicitConfig);

  const schemaSource = generateSchemaSource(config).source;
  writeIfChanged(resolve(cwd, ".plumix/schema.ts"), schemaSource);

  const workerSource = generateWorkerSource({
    configModule: resolveConfigSpecifier(cwd, configPath),
  });
  writeIfChanged(resolve(cwd, ".plumix/worker.ts"), workerSource);

  return { configPath };
}

// Copies the compiled admin SPA from plumix/dist/admin-app into the effective
// publicDir under _plumix/admin/. The runtime adapter's asset-serving layer
// (Cloudflare Workers Assets today, equivalents in future adapters) picks the
// files up from publicDir automatically. Skips the copy when the destination
// is already at least as fresh as the source so repeated regenerate() calls
// during dev don't bounce Vite's file watcher.
async function stageAdminAssets(publicDir: string): Promise<void> {
  const dest = resolve(publicDir, "_plumix/admin");
  if (await destIsFresh(dest, ADMIN_SOURCE_DIR)) return;
  await rm(dest, { recursive: true, force: true });
  await cp(ADMIN_SOURCE_DIR, dest, { recursive: true });
}

async function destIsFresh(dest: string, src: string): Promise<boolean> {
  try {
    const [srcStat, destStat] = await Promise.all([stat(src), stat(dest)]);
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
