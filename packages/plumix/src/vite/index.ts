import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";

import type {
  AnyPluginDescriptor,
  PluginRegistry,
  PlumixManifest,
} from "@plumix/core";
import {
  buildManifest,
  generateSchemaSource,
  generateWorkerSource,
  HookRegistry,
  injectManifestIntoHtml,
  installPlugins,
} from "@plumix/core";

import { loadConfig } from "../cli/load-config.js";
import { assemblePluginAdminBundle } from "./admin-plugin-bundle.js";

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
    //
    // Also `define` the Workers Builds env vars consumers can read from
    // `plumix.config.ts` (e.g. via `cloudflareDeployOrigin`). Vite
    // substitutes the literals at bundle time so the runtime worker
    // doesn't depend on `process.env` being populated — CF Workers'
    // process.env is empty by default and the helper would otherwise
    // fall back to localhost on every deployed request.
    config(userConfig) {
      const define = {
        "process.env.WORKERS_CI": JSON.stringify(process.env.WORKERS_CI ?? ""),
        "process.env.WORKERS_CI_BRANCH": JSON.stringify(
          process.env.WORKERS_CI_BRANCH ?? "",
        ),
      };
      if (userConfig.publicDir !== undefined) return { define };
      return { publicDir: ".plumix/public", define };
    },
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
    },
    async buildStart() {
      const emitted = await regenerate(root, options.configFile);
      configPath = emitted.configPath;
      warnOnPluginAdminMismatch(emitted.plugins, this.warn.bind(this));
      await stageAdminAssets(
        publicDir,
        emitted.manifest,
        emitted.plugins,
        emitted.registry,
        root,
      );
    },
    configureServer(server) {
      server.watcher.on("change", (path) => {
        if (!configPath || resolve(path) !== configPath) return;
        void regenerate(root, options.configFile)
          .then(async (emitted) => {
            await stageAdminAssets(
              publicDir,
              emitted.manifest,
              emitted.plugins,
              emitted.registry,
              root,
            );
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
): Promise<{
  configPath: string;
  manifest: PlumixManifest;
  registry: PluginRegistry;
  plugins: readonly AnyPluginDescriptor[];
}> {
  const { config, configPath } = await loadConfig(cwd, explicitConfig);

  const schemaSource = generateSchemaSource(config).source;
  writeIfChanged(resolve(cwd, ".plumix/schema.ts"), schemaSource);

  const workerSource = generateWorkerSource({
    configModule: resolveConfigSpecifier(cwd, configPath),
  });
  writeIfChanged(resolve(cwd, ".plumix/worker.ts"), workerSource);

  const { manifest, registry } = await computeManifestAndRegistry(
    config.plugins,
  );

  return { configPath, manifest, registry, plugins: config.plugins };
}

type PluginDescriptors = Parameters<typeof installPlugins>[0]["plugins"];

// Run plugin `setup()` callbacks into a throwaway hook registry just to
// capture what's been registered. Hooks wired up here are discarded —
// the manifest plus the populated registry are everything downstream
// needs (manifest → wire payload, registry → admin-plugin-bundle's
// auto-register synthesis). If a plugin throws on setup we surface it
// as-is: a broken config should fail the build, not silently ship an
// empty manifest. Note: `setup()` runs on every dev config-file change,
// so plugins should keep setup free of IO.
async function computeManifestAndRegistry(
  plugins: PluginDescriptors,
): Promise<{ manifest: PlumixManifest; registry: PluginRegistry }> {
  const { registry } = await installPlugins({
    hooks: new HookRegistry(),
    plugins,
  });
  return { manifest: buildManifest(registry), registry };
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
  plugins: readonly AnyPluginDescriptor[],
  registry: PluginRegistry,
  projectRoot: string,
): Promise<void> {
  const dest = resolve(publicDir, "_plumix/admin");
  if (!(await destIsFresh(dest, ADMIN_SOURCE_DIR))) {
    await rm(dest, { recursive: true, force: true });
    await cp(ADMIN_SOURCE_DIR, dest, { recursive: true });
  }
  const chunks = await stagePluginChunks(dest, plugins, projectRoot);
  // Plugins that ship `adminEntry` (TS source) get assembled into a
  // single per-site bundle with the runtime alias seam. Legacy
  // `adminChunk` (pre-built JS) plugins keep their existing path.
  const assembled = await assemblePluginAdminBundle({
    plugins,
    registry,
    adminDest: dest,
    projectRoot,
  });
  const allChunks: PluginChunkRef[] = [...chunks];
  if (assembled) {
    allChunks.push({
      pluginId: "site-bundle",
      chunkUrl: assembled.chunkUrl,
      cssUrl: assembled.cssUrl,
    });
  }
  await injectIndexHtml(resolve(dest, "index.html"), manifest, allChunks);
}

interface PluginChunkRef {
  readonly pluginId: string;
  readonly chunkUrl: string;
  readonly cssUrl?: string;
}

async function stagePluginChunks(
  adminDest: string,
  plugins: readonly AnyPluginDescriptor[],
  projectRoot: string,
): Promise<readonly PluginChunkRef[]> {
  const chunks: PluginChunkRef[] = [];
  const withChunks = plugins.filter(
    (p): p is AnyPluginDescriptor & { adminChunk: string } =>
      typeof p.adminChunk === "string" && p.adminChunk.length > 0,
  );
  if (withChunks.length === 0) return chunks;

  const pluginsDir = resolve(adminDest, "plugins");
  await mkdir(pluginsDir, { recursive: true });
  const staged = await Promise.all(
    withChunks.map(async (plugin): Promise<PluginChunkRef> => {
      const chunkSource = await resolvePluginAsset(
        plugin.id,
        "adminChunk",
        plugin.adminChunk,
        projectRoot,
      );
      const chunkCopy = copyFile(
        chunkSource,
        resolve(pluginsDir, `${plugin.id}.js`),
      );
      let cssUrl: string | undefined;
      let cssCopy: Promise<void> | undefined;
      if (plugin.adminCss) {
        const cssSource = await resolvePluginAsset(
          plugin.id,
          "adminCss",
          plugin.adminCss,
          projectRoot,
        );
        cssCopy = copyFile(cssSource, resolve(pluginsDir, `${plugin.id}.css`));
        cssUrl = `./plugins/${plugin.id}.css`;
      }
      const pending: Promise<void>[] = [chunkCopy];
      if (cssCopy) pending.push(cssCopy);
      await Promise.all(pending);
      return {
        pluginId: plugin.id,
        chunkUrl: `./plugins/${plugin.id}.js`,
        cssUrl,
      };
    }),
  );
  chunks.push(...staged);
  return chunks;
}

async function resolvePluginAsset(
  pluginId: string,
  field: string,
  relOrAbs: string,
  projectRoot: string,
): Promise<string> {
  const source = isAbsolute(relOrAbs)
    ? relOrAbs
    : resolve(projectRoot, relOrAbs);
  try {
    await stat(source);
  } catch {
    throw new Error(
      `[plumix] plugin "${pluginId}" declares ${field} "${relOrAbs}" but ` +
        `the file was not found at ${source}. Build the plugin's admin ` +
        `assets before running \`plumix build\`.`,
    );
  }
  return source;
}

async function injectIndexHtml(
  indexHtmlPath: string,
  manifest: PlumixManifest,
  chunks: readonly PluginChunkRef[],
): Promise<void> {
  const html = await readFile(indexHtmlPath, "utf8");
  const withManifest = injectManifestIntoHtml(html, manifest);
  const next = injectPluginChunkScripts(withManifest, chunks);
  if (next === html) return;
  await writeFile(indexHtmlPath, next, "utf8");
}

// Plugin chunks load AFTER the main admin bundle so window.plumix is
// populated before they execute. Block is replaced (not appended) on
// rebuild so the HTML stays stable.
const PLUGIN_CHUNKS_MARKER = "<!-- plumix:plugin-chunks -->";
const PLUGIN_CHUNKS_RE =
  /<!-- plumix:plugin-chunks -->[\s\S]*?<!-- \/plumix:plugin-chunks -->/;

function injectPluginChunkScripts(
  html: string,
  chunks: readonly PluginChunkRef[],
): string {
  const block = buildPluginChunkBlock(chunks);
  if (PLUGIN_CHUNKS_RE.test(html)) {
    return html.replace(PLUGIN_CHUNKS_RE, block);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${block}\n</body>`);
  }
  return `${html}\n${block}`;
}

function buildPluginChunkBlock(chunks: readonly PluginChunkRef[]): string {
  const tags: string[] = [];
  for (const c of chunks) {
    if (c.cssUrl) {
      tags.push(
        `<link rel="stylesheet" data-plumix-plugin="${escapeAttribute(c.pluginId)}" href="${escapeAttribute(c.cssUrl)}">`,
      );
    }
    tags.push(
      `<script type="module" data-plumix-plugin="${escapeAttribute(c.pluginId)}" src="${escapeAttribute(c.chunkUrl)}"></script>`,
    );
  }
  return `${PLUGIN_CHUNKS_MARKER}\n${tags.join("\n")}\n<!-- /plumix:plugin-chunks -->`;
}

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
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

function warnOnPluginAdminMismatch(
  plugins: readonly AnyPluginDescriptor[],
  warn: (message: string) => void,
): void {
  const adminVersion = readAdminVersion();
  for (const plugin of plugins) {
    if (plugin.adminPeerVersion && adminVersion) {
      if (!satisfiesLoose(adminVersion, plugin.adminPeerVersion)) {
        warn(
          `plugin "${plugin.id}" was built against @plumix/admin ` +
            `${plugin.adminPeerVersion}, but the consumer has ` +
            `${adminVersion}. Its admin chunk may call APIs the host ` +
            `no longer exposes.`,
        );
      }
    }
  }
}

function readAdminVersion(): string | null {
  try {
    const adminPkgPath = fileURLToPath(
      new URL("../../../admin/package.json", import.meta.url),
    );
    const raw = readFileSync(adminPkgPath, "utf8");
    const pkg = JSON.parse(raw) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : null;
  } catch {
    return null;
  }
}

// Strips common range prefixes and matches on 0.x-minor or 1.x+ major.
// Advisory only; not a rigorous semver implementation.
function satisfiesLoose(installed: string, range: string): boolean {
  const base = range.replace(/^[~^><=]+/, "").trim();
  if (!base) return true;
  const [rMajor, rMinor] = base.split(".");
  const [iMajor, iMinor] = installed.split(".");
  if (rMajor === "0") {
    // 0.x-pinned ranges require an explicit minor (`^0.5` matches
    // 0.5.x). A bare "0" is too loose to interpret meaningfully —
    // fall back to major-only equality so we don't spuriously warn.
    if (rMinor === undefined) return rMajor === iMajor;
    return rMajor === iMajor && rMinor === iMinor;
  }
  return rMajor === iMajor;
}

export { assemblePluginAdminBundle } from "./admin-plugin-bundle.js";
export { plumix as default };
