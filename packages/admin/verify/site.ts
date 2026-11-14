import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ChildProcess } from "node:child_process";

import type { PluginRegistry, PlumixConfig } from "@plumix/core";
import {
  buildManifest,
  createPluginRegistry,
  HandlerRegistry,
  installPlugins,
} from "@plumix/core";
import { factoriesFor } from "@plumix/core/test";
import {
  openPlaygroundDb,
  playgroundWebServer,
  superviseWebServer,
} from "@plumix/core/test/playwright";

export const REPO_ROOT = resolve(import.meta.dirname, "../../..");

/** A playground `pnpm verify:admin` can boot, by the name `--site` takes. */
export interface Site {
  readonly name: string;
  readonly dir: string;
}

export interface RunningSite {
  /** The admin's base URL, ending in `/`. */
  readonly adminURL: string;
  readonly stop: () => Promise<void>;
}

const CONFIG_FILE = "plumix.config.ts";
const PLUGINS_DIR = join(REPO_ROOT, "packages/plugins");
const ADMIN_PATH = "/_plumix/admin/";
/** As long as `definePlumixE2EConfig` gives a playground to come up. */
const BOOT_TIMEOUT_MS = 180_000;
const READINESS_POLL_MS = 250;
/** Playwright's own bar for a web server's readiness URL. */
const FIRST_UNREADY_STATUS = 404;

export function playgroundSites(): readonly Site[] {
  const plugins = readdirSync(PLUGINS_DIR)
    .sort()
    .map((name) => ({ name, dir: join(PLUGINS_DIR, name, "playground") }));
  return [
    { name: "core", dir: join(REPO_ROOT, "packages/core/playground") },
    ...plugins,
  ].filter((site) => existsSync(join(site.dir, CONFIG_FILE)));
}

export function findSite(name: string): Site | undefined {
  return playgroundSites().find((site) => site.name === name);
}

/**
 * The registry the site's `plumix dev` builds its manifest from: its plugins
 * installed with its theme, framework routes and roles.
 */
export async function siteRegistry(site: Site): Promise<PluginRegistry> {
  const configUrl = pathToFileURL(join(site.dir, CONFIG_FILE)).href;
  const { default: config } = (await import(configUrl)) as {
    readonly default: PlumixConfig;
  };
  const { registry } = await installPlugins({
    handlers: new HandlerRegistry(),
    plugins: config.plugins,
    registry: createPluginRegistry(config.routes, config.roles),
    theme: config.theme,
  });
  return registry;
}

function freePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      server.close(() => {
        if (address === null || typeof address === "string") {
          reject(new Error("The OS gave no port to listen on."));
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

async function isReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.status < FIRST_UNREADY_STATUS;
  } catch {
    return false;
  }
}

function waitUntilReady(
  url: string,
  server: ChildProcess,
  output: () => string,
): Promise<void> {
  return new Promise((resolveReady, reject) => {
    const deadline = Date.now() + BOOT_TIMEOUT_MS;
    const onExit = (code: number | null) => {
      reject(
        new Error(
          `The playground exited (${String(code)}) before it served.\n${output()}`,
        ),
      );
    };
    server.once("exit", onExit);
    const poll = async () => {
      if (await isReady(url)) {
        server.off("exit", onExit);
        resolveReady();
        return;
      }
      if (Date.now() > deadline) {
        server.off("exit", onExit);
        reject(
          new Error(
            `The playground did not serve ${url} within ${String(BOOT_TIMEOUT_MS / 1000)}s.\n${output()}`,
          ),
        );
        return;
      }
      setTimeout(() => void poll(), READINESS_POLL_MS);
    };
    void poll();
  });
}

/**
 * Boots the playground the way its e2e suite does, from a wiped state, on a
 * free port. The server stops with this process however it ends.
 */
export async function startSite(site: Site): Promise<RunningSite> {
  const port = await freePort();
  const { command, url } = playgroundWebServer({
    configDir: REPO_ROOT,
    playground: relative(REPO_ROOT, site.dir),
    port,
    inspectorPort: await freePort(),
  });
  // Spawned as Playwright spawns a web server: the supervisor leads its own
  // process group and kills it when our end of its stdin closes.
  const server = spawn(superviseWebServer(command), {
    cwd: REPO_ROOT,
    shell: true,
    detached: true,
    stdio: ["pipe", "pipe", "pipe"],
  });
  const chunks: Buffer[] = [];
  server.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
  server.stderr.on("data", (chunk: Buffer) => chunks.push(chunk));
  const exited = new Promise<void>((resolveExit) => {
    server.once("exit", () => {
      resolveExit();
    });
  });
  const stop = async () => {
    server.stdin.end();
    await exited;
  };
  try {
    await waitUntilReady(url, server, () => Buffer.concat(chunks).toString());
  } catch (error) {
    await stop();
    throw error;
  }
  return { adminURL: `http://localhost:${String(port)}${ADMIN_PATH}`, stop };
}

/**
 * Writes `count` published entries of each entry type, and `count` terms of
 * each taxonomy, that the admin's sidebar lists.
 */
export async function seedSite(
  site: Site,
  registry: PluginRegistry,
  count: number,
): Promise<void> {
  const manifest = buildManifest(registry);
  const db = await openPlaygroundDb({ cwd: site.dir });
  const factories = factoriesFor(db);
  try {
    for (const entryType of manifest.entryTypes) {
      if (!entryType.showInSidebar) continue;
      await factories.published.createList(count, { type: entryType.name });
    }
    for (const taxonomy of manifest.termTaxonomies) {
      if (!taxonomy.showInSidebar) continue;
      await factories.term.createList(count, { taxonomy: taxonomy.name });
    }
  } finally {
    db.$client.close();
  }
}
