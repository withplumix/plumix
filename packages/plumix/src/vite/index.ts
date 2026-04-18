import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import type { Plugin } from "vite";

import { generateSchemaSource, generateWorkerSource } from "@plumix/core";

import { loadConfig } from "../cli/load-config.js";

export interface PlumixVitePluginOptions {
  readonly configFile?: string;
}

export function plumix(options: PlumixVitePluginOptions = {}): Plugin {
  let root = process.cwd();
  let configPath: string | undefined;

  return {
    name: "plumix",
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

  return { configPath };
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
