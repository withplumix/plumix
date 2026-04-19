import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cp, rm } from "node:fs/promises";
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
  let configPath: string | undefined;

  return {
    name: "plumix",
    // Point Vite's static-asset root at the dir we populate (admin + anything
    // else plumix stages). Consumers who want their own static files can still
    // drop them into .plumix/public/ under their own namespace.
    config() {
      return {
        publicDir: ".plumix/public",
      };
    },
    configResolved(config) {
      root = config.root;
    },
    async buildStart() {
      const emitted = await regenerate(root, options.configFile);
      configPath = emitted.configPath;
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

  await stageAdminAssets(cwd);

  return { configPath };
}

// Stages the compiled admin SPA from plumix/dist/admin-app into the consumer
// project at .plumix/public/_plumix/admin/. The consumer's wrangler config
// points its `assets.directory` at .plumix/public, so Cloudflare Workers
// Assets serves these files at /_plumix/admin/* in both dev and production.
async function stageAdminAssets(cwd: string): Promise<void> {
  const dest = resolve(cwd, ".plumix/public/_plumix/admin");
  await rm(dest, { recursive: true, force: true });
  await cp(ADMIN_SOURCE_DIR, dest, { recursive: true });
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
