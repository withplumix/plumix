import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import type { SourceMapInput } from "@jridgewell/trace-mapping";
import type { IncomingMessage } from "node:http";
import type { BuildEnvironmentOptions, Plugin, UserConfig } from "vite";
import * as v from "valibot";
import { mergeConfig } from "vite";

import type {
  AnyPluginDescriptor,
  PluginRegistry,
  PlumixManifest,
  RuntimeAdapter,
} from "@plumix/core";
import {
  collectNamedTemplates,
  configuredSlotsOf,
  generateSchemaSource,
  injectManifestIntoHtml,
  isTrustedDevHost,
} from "@plumix/core";
import {
  DEV_ERROR_CLIENT_ERRORS_ENDPOINT,
  DEV_ERROR_SOURCE_ENDPOINT,
  DEV_ERROR_STACK_ENDPOINT,
  DEV_ERROR_TERMINAL_ENDPOINT,
} from "@plumix/core/dev-client";

import type { LoadConfigOptions } from "../cli/load-config.js";
import type { BlockModuleRef } from "./block-module-resolver.js";
import type { DiscoveredIsland } from "./island-transform.js";
import type { PluginCatalogFile } from "./plugin-catalogs-codegen.js";
import { loadConfig } from "../cli/load-config.js";
import {
  ADMIN_URL_PREFIX,
  assemblePluginAdminBundle,
} from "./admin-plugin-bundle.js";
import { generateClientEntrySource } from "./client-entry-codegen.js";
import { handleDevErrorSourceRequest } from "./dev-error-source.js";
import {
  handleDevErrorStackRequest,
  resolveClientStack,
} from "./dev-error-stack.js";
import { createTerminalForwarder } from "./dev-error-terminal.js";
import {
  collectEditorBlockModules,
  collectEditorShortcodeModules,
} from "./editor-block-modules.js";
import { generateEditorEntrySource } from "./editor-entry-codegen.js";
import { VitePluginError } from "./errors.js";
import {
  loadAssetManifest,
  resolveIslandChunkUrl,
} from "./island-chunk-url.js";
import {
  ORIG_QUERY,
  scanUserSources,
  SERIALIZE_VIRTUAL_ID,
  transformUseClientModule,
} from "./island-transform.js";
import { computeManifestAndRegistry } from "./manifest.js";
import { plumixPathAliases } from "./path-aliases.js";
import {
  collectPluginCatalogFiles,
  findAdminBundledPluginsDir,
  stagePluginCatalogs,
} from "./plugin-catalog-resolve.js";
import { generatePluginCatalogsSource } from "./plugin-catalogs-codegen.js";
import { stageUserPublic } from "./public-staging.js";
import { stageIntoPlace } from "./stage-into-place.js";
import { generateWorkerExportsSource } from "./worker-exports-codegen.js";

// Relies on @plumix/admin exposing its package.json; it declares no `exports`
// map, so add a `"./package.json"` export if one is introduced.
const require = createRequire(import.meta.url);
const ADMIN_PACKAGE_ROOT = dirname(
  require.resolve("@plumix/admin/package.json"),
);
const ADMIN_SOURCE_DIR = resolve(ADMIN_PACKAGE_ROOT, "dist");
const ADMIN_BUNDLED_PLUGINS_DIR =
  findAdminBundledPluginsDir(ADMIN_PACKAGE_ROOT);

export interface PlumixVitePluginOptions {
  readonly configFile?: string;
}

const ASSET_MANIFEST_VIRTUAL_ID = "virtual:plumix/asset-manifest";
const ASSET_MANIFEST_RESOLVED_ID = "\0" + ASSET_MANIFEST_VIRTUAL_ID;

const SERIALIZE_RESOLVED_ID = "\0" + SERIALIZE_VIRTUAL_ID;

const WORKER_EXPORTS_VIRTUAL_ID = "virtual:plumix/worker-exports";
const WORKER_EXPORTS_RESOLVED_ID = "\0" + WORKER_EXPORTS_VIRTUAL_ID;

const PLUGIN_CATALOGS_VIRTUAL_ID = "virtual:plumix/plugin-catalogs";
const PLUGIN_CATALOGS_RESOLVED_ID = "\0" + PLUGIN_CATALOGS_VIRTUAL_ID;

export function plumix(options: PlumixVitePluginOptions = {}): Plugin {
  let root = process.cwd();
  let publicDir = "";
  let configPath: string | undefined;
  let command: "serve" | "build" = "serve";
  // Populated from `runtime.workerExports` on each regenerate; served by the
  // `virtual:plumix/worker-exports` module the generated worker re-exports.
  let workerExports: readonly string[] = [];
  // Populated from each plugin's `i18n` slot on each regenerate; served by the
  // `virtual:plumix/plugin-catalogs` module the generated entry imports.
  let pluginCatalogFiles: ReadonlyMap<string, readonly PluginCatalogFile[]> =
    new Map();
  // Discovered at config() time so rollupOptions.input can be extended
  // before Vite resolves entries.
  let islands: readonly DiscoveredIsland[] = [];

  return {
    name: "plumix",
    // A consumer's explicit publicDir wins. Workers Builds env vars are
    // `define`d because a Worker's `process.env` is empty, so deploys would
    // fall back to localhost.
    async config(userConfig, env) {
      const define = {
        "process.env.WORKERS_CI": JSON.stringify(process.env.WORKERS_CI ?? ""),
        "process.env.WORKERS_CI_BRANCH": JSON.stringify(
          process.env.WORKERS_CI_BRANCH ?? "",
        ),
        // A literal, so the SSR worker gets a static boolean with no `process`
        // lookup.
        "process.env.PLUMIX_DEV": JSON.stringify(
          env.command === "build" ? "" : "1",
        ),
        // Opts out of the loopback-only gate on core's dev surfaces, for a
        // phone, tunnel or codespace. Empty in production, where those
        // tree-shake out.
        "process.env.PLUMIX_DEV_ALLOW_REMOTE": JSON.stringify(
          env.command === "build"
            ? ""
            : (process.env.PLUMIX_DEV_ALLOW_REMOTE ?? ""),
        ),
        // Substituted at bundle time because the dev worker's `process.env` is
        // empty.
        "process.env.PLUMIX_EDITOR": JSON.stringify(
          env.command === "build" ? "" : (process.env.PLUMIX_EDITOR ?? ""),
        ),
        // For a dev server whose filesystem differs from the editor host's
        // (container, remote).
        "process.env.PLUMIX_EDITOR_PATH_MAP": JSON.stringify(
          env.command === "build"
            ? ""
            : (process.env.PLUMIX_EDITOR_PATH_MAP ?? ""),
        ),
        "process.env.PLUMIX_FORWARD_ERRORS": JSON.stringify(
          env.command === "build"
            ? ""
            : (process.env.PLUMIX_FORWARD_ERRORS ?? ""),
        ),
      };
      // `build.manifest: true` makes Vite emit `<outDir>/.vite/manifest.json`,
      // which the worker imports through `virtual:plumix/asset-manifest` so
      // the SSR renderer knows which hashed `<link rel="stylesheet">` tags
      // to inject after the theme's own `link[]`.
      const build = { manifest: true };
      // @cloudflare/vite-plugin falls back to its private entry only when no
      // client input is set. Each `"use client"` module becomes its own input
      // so Vite emits one hashed chunk per island.
      const scanRoot = userConfig.root ?? process.cwd();
      islands = scanUserSources(scanRoot);
      const islandInputs: Record<string, string> = {};
      const seenSourcePaths = new Set<string>();
      for (const island of islands) {
        if (seenSourcePaths.has(island.sourcePath)) continue;
        seenSourcePaths.add(island.sourcePath);
        islandInputs[islandEntryName(island)] = island.sourcePath;
      }
      const environments = {
        client: {
          build: {
            manifest: true,
            rollupOptions: {
              // Island chunks are reached only via runtime URLs, so without
              // strict signatures the side-effect-free renderer entry
              // tree-shakes to empty.
              preserveEntrySignatures: "strict" as const,
              input: {
                "plumix-client": ".plumix/client-entry.ts",
                // Per-page islands runtime — bootstraps the custom element
                // + strategies. Bundled as its own chunk so the SSR layer
                // can inject `<script src="<hashed-url>">` only when the
                // page contains at least one `<plumix-island>`.
                "plumix-islands-runtime": ".plumix/islands-entry.ts",
                // React renderer chunk — dynamic-imported by the element
                // on first hydration, never loaded eagerly.
                "plumix-islands-renderer": ".plumix/islands-renderer-entry.ts",
                // Visual-editor runtime — bundled as its own chunk so the
                // SSR layer injects `<script src="<hashed-url>">` only when
                // the edit gate authorizes it.
                "plumix-editor": ".plumix/editor-entry.ts",
                ...islandInputs,
              },
            },
          },
        },
      };
      const resolveOpts = {
        alias: plumixPathAliases(userConfig.root ?? process.cwd()),
      };
      // Default publicDir to `.plumix/public` only when the user hasn't
      // set one — Vite merges the returned object with `userConfig`, so
      // we keep theirs by omitting the key entirely.
      const base: Partial<UserConfig> = {
        define,
        build,
        environments,
        resolve: resolveOpts,
        // Plumix forwards browser errors and renders `vite:error` itself, so
        // Vite's `forwardConsole` and overlay would duplicate them. Staged
        // `index.html` writes would read as page reloads.
        server: {
          forwardConsole: false,
          hmr: { overlay: false },
          watch: { ignored: [isInAdminStaging(resolve(scanRoot))] },
        },
      };
      if (userConfig.publicDir === undefined) {
        base.publicDir = ".plumix/public";
      }
      const { config } = await loadConfig(scanRoot, options.configFile);
      const merged = config.vite
        ? (mergeConfig(
            base,
            config.vite as Partial<UserConfig>,
          ) as Partial<UserConfig>)
        : base;
      const onLog = withoutUseClientWarning(
        merged.build?.rolldownOptions?.onLog ??
          userConfig.build?.rolldownOptions?.onLog,
      );
      return mergeConfig(merged, { build: { rolldownOptions: { onLog } } });
    },
    configResolved(config) {
      root = config.root;
      publicDir = config.publicDir;
      command = config.command;
    },
    resolveId(id, importer) {
      if (id === ASSET_MANIFEST_VIRTUAL_ID) return ASSET_MANIFEST_RESOLVED_ID;
      if (id === SERIALIZE_VIRTUAL_ID) return SERIALIZE_RESOLVED_ID;
      if (id === WORKER_EXPORTS_VIRTUAL_ID) return WORKER_EXPORTS_RESOLVED_ID;
      if (id === PLUGIN_CATALOGS_VIRTUAL_ID) return PLUGIN_CATALOGS_RESOLVED_ID;
      // `transform` short-circuits on this query so the shim isn't recursively
      // wrapped.
      if (id.endsWith(ORIG_QUERY)) {
        if (!importer) return id;
        const cleanId = id.slice(0, -ORIG_QUERY.length);
        return resolve(dirname(importer), cleanId) + ORIG_QUERY;
      }
      return null;
    },
    load(id) {
      if (id.endsWith(ORIG_QUERY)) {
        const filePath = id.slice(0, -ORIG_QUERY.length);
        return readFileSync(filePath, "utf8");
      }
      if (id === WORKER_EXPORTS_RESOLVED_ID) {
        return generateWorkerExportsSource(workerExports);
      }
      if (id === PLUGIN_CATALOGS_RESOLVED_ID) {
        return generatePluginCatalogsSource(pluginCatalogFiles);
      }
      if (id === SERIALIZE_RESOLVED_ID) {
        // Resolved from the project root, where `plumix` is always a
        // dependency, so an island in any package gets a working import.
        return `export { IslandShim } from "plumix/blocks";`;
      }
      if (id === ASSET_MANIFEST_RESOLVED_ID) {
        // `{}` in dev, and on a cold Cloudflare build, which builds the worker
        // before the client.
        return `export default ${JSON.stringify(loadAssetManifest(root))};`;
      }
      return null;
    },
    transform(code, id, options) {
      if (!options?.ssr) return null;
      if (id.endsWith(ORIG_QUERY)) return null;
      // `.js`/`.jsx` covers theme-shipped islands compiled by tsc — the
      // `"use client"` directive survives in the dist file (#606).
      if (
        !id.endsWith(".tsx") &&
        !id.endsWith(".ts") &&
        !id.endsWith(".jsx") &&
        !id.endsWith(".js")
      ) {
        return null;
      }
      if (!code.includes("use client")) return null;
      const chunkUrl = resolveIslandChunkUrl(id, command, root);
      const result = transformUseClientModule(code, id, { chunkUrl });
      return result ? { code: result.code, map: null } : null;
    },
    async buildStart() {
      const emitted = await regenerate(root, options.configFile);
      configPath = emitted.configPath;
      workerExports = emitted.workerExports;
      pluginCatalogFiles = emitted.pluginCatalogFiles;
      warnOnPluginAdminMismatch(emitted.plugins, this.warn.bind(this));
      // The `_plumix/` filter in `stageUserPublic` keeps a user's files
      // out of the admin's subtree, which `stageAdminAssets` owns.
      await stageUserPublic({ workspaceRoot: root, publicDir });
      await stageAdminAssets(
        publicDir,
        emitted.manifest,
        emitted.plugins,
        emitted.registry,
        root,
        emitted.editorBlockModules,
      );
    },
    // No watcher on workspace `public/` here — Vite serves `publicDir`
    // contents directly from disk in dev, so file edits / additions are
    // picked up on next request without a re-stage.
    configureServer(server) {
      // The worker has no `fs`. Registered ahead of the @cloudflare/vite-plugin
      // proxy, so the request never reaches the worker.
      server.middlewares.use((req, res, next) => {
        const rawUrl = req.url ?? "";
        const isSourceRequest =
          (req.method === "GET" || req.method === "HEAD") &&
          (rawUrl === DEV_ERROR_SOURCE_ENDPOINT ||
            rawUrl.startsWith(DEV_ERROR_SOURCE_ENDPOINT + "?"));
        // Widest disclosure the dev server has — any file under the fs
        // allowlist — so the loopback gate matters here most of all (#2007).
        if (!isSourceRequest || !isTrustedDevHost(req.headers.host)) {
          next();
          return;
        }
        // Vite's own dev fs allowlist — spans the workspace root, so symlinked
        // monorepo packages resolve too.
        const allow = server.config.server.fs.allow;
        void handleDevErrorSourceRequest(rawUrl, allow, {
          readFile: (path) => readFile(path, "utf8"),
        })
          .then(({ status, body }) => {
            res.statusCode = status;
            if (body === null) {
              res.end();
              return;
            }
            res.setHeader("content-type", "application/json; charset=utf-8");
            res.end(body);
          })
          .catch(() => {
            res.statusCode = 500;
            res.end();
          });
      });
      // Shared by the two POST endpoints below: map a browser module URL to its
      // dev transform sourcemap + file, so both surfaces resolve the same way.
      const lookup = async (url: string) => {
        const mod = await server.moduleGraph.getModuleByUrl(url);
        if (!mod) return null;
        // Vite's `SourceMap` is a valid encoded map at runtime; its type just
        // diverges from trace-mapping's `SourceMapInput` (encoded vs decoded
        // `mappings`). The resolver only reads it through `TraceMap`.
        const map = (mod.transformResult?.map ?? null) as SourceMapInput | null;
        return { map, file: mod.file };
      };

      // Register a dev-only endpoint that reads a JSON POST body and answers
      // with JSON. Ordered ahead of the worker proxy (plumix precedes it), so
      // these never reach the worker.
      const usePostJson = (
        endpoint: string,
        handle: (body: string) => Promise<{ status: number; body?: string }>,
      ): void => {
        server.middlewares.use((req, res, next) => {
          if (
            req.method !== "POST" ||
            (req.url ?? "") !== endpoint ||
            !isTrustedDevHost(req.headers.host)
          ) {
            next();
            return;
          }
          readBody(req)
            .then(handle)
            .then(({ status, body }) => {
              res.statusCode = status;
              res.setHeader("content-type", "application/json; charset=utf-8");
              res.end(body ?? "{}");
            })
            .catch(() => {
              res.statusCode = 500;
              res.end();
            });
        });
      };

      // Only the dev server's per-module sourcemaps can map the browser's
      // transformed positions.
      usePostJson(DEV_ERROR_STACK_ENDPOINT, (body) =>
        handleDevErrorStackRequest(body, { lookup }),
      );

      // One instance per dev session holds the collapse state.
      const forwarder = createTerminalForwarder({
        resolveStack: (stack) => resolveClientStack(stack, { lookup }),
        print: (message) => server.config.logger.info(message),
        root: server.config.root,
      });
      usePostJson(DEV_ERROR_TERMINAL_ENDPOINT, (body) =>
        forwarder.handle(body),
      );

      server.middlewares.use((req, res, next) => {
        if (
          req.method !== "GET" ||
          (req.url ?? "") !== DEV_ERROR_CLIENT_ERRORS_ENDPOINT ||
          !isTrustedDevHost(req.headers.host)
        ) {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader("content-type", "application/json; charset=utf-8");
        res.end(JSON.stringify({ errors: forwarder.read() }));
      });

      server.watcher.on("change", (path) => {
        if (!configPath || resolve(path) !== configPath) return;
        // Force-fresh: the whole point of the watcher is to pick up the edit,
        // so bypass (and refresh) the cold-start config cache.
        void regenerate(root, options.configFile, { fresh: true })
          .then(async (emitted) => {
            workerExports = emitted.workerExports;
            pluginCatalogFiles = emitted.pluginCatalogFiles;
            await stageUserPublic({ workspaceRoot: root, publicDir });
            await stageAdminAssets(
              publicDir,
              emitted.manifest,
              emitted.plugins,
              emitted.registry,
              root,
              emitted.editorBlockModules,
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
 * Lets a runtime adapter's CLI create `.plumix/worker.ts` and
 * `.plumix/schema.ts` before Vite starts: @cloudflare/vite-plugin validates
 * wrangler's `main` early.
 */
export async function emitPlumixSources(
  cwd: string,
  explicitConfig?: string,
  options?: LoadConfigOptions,
): Promise<{ configPath: string; runtime: RuntimeAdapter }> {
  const { configPath, runtime } = await regenerate(
    cwd,
    explicitConfig,
    options,
  );
  return { configPath, runtime };
}

async function regenerate(
  cwd: string,
  explicitConfig: string | undefined,
  // The dev watcher forces a fresh config eval on `plumix.config.ts` edits;
  // cold-start callers share the cached one (#1102).
  options?: LoadConfigOptions,
): Promise<{
  configPath: string;
  runtime: RuntimeAdapter;
  manifest: PlumixManifest;
  registry: PluginRegistry;
  plugins: readonly AnyPluginDescriptor[];
  workerExports: readonly string[];
  pluginCatalogFiles: ReadonlyMap<string, readonly PluginCatalogFile[]>;
  editorBlockModules: readonly BlockModuleRef[];
}> {
  const { config, configPath } = await loadConfig(cwd, explicitConfig, options);

  const schemaSource = generateSchemaSource(config).source;
  writeIfChanged(resolve(cwd, ".plumix/schema.ts"), schemaSource);

  const entrySource = config.runtime.generateEntry({
    configModule: resolveConfigSpecifier(cwd, configPath),
  });
  writeIfChanged(resolve(cwd, ".plumix/worker.ts"), entrySource);

  // Always emitted, even empty: `config()` lists it as a client entry
  // unconditionally. Theme CSS reaches the bundle through it, never through
  // jiti.
  const clientEntrySource = generateClientEntrySource(config.theme.css ?? []);
  writeIfChanged(resolve(cwd, ".plumix/client-entry.ts"), clientEntrySource);

  // Its own chunk, so the SSR layer injects it only on pages with a
  // `<plumix-island>`.
  writeIfChanged(
    resolve(cwd, ".plumix/islands-entry.ts"),
    `// Generated by plumix — do not edit.\nimport "plumix/blocks/island-runtime";\n`,
  );

  // Its own chunk, dynamic-imported on first hydration, so React loads only
  // when an island hydrates.
  writeIfChanged(
    resolve(cwd, ".plumix/islands-renderer-entry.ts"),
    `// Generated by plumix — do not edit.\nexport * from "plumix/blocks/island-renderer";\n`,
  );

  // Injected only when the edit gate authorizes it.
  const configSource = readFileSync(configPath, "utf8");
  const editorBlockModules = collectEditorBlockModules(
    configPath,
    configSource,
  );
  writeIfChanged(
    resolve(cwd, ".plumix/editor-entry.ts"),
    generateEditorEntrySource(
      resolve(cwd, ".plumix"),
      editorBlockModules,
      collectEditorShortcodeModules(configPath, configSource),
    ),
  );

  const { manifest, registry } = await computeManifestAndRegistry(
    config.plugins,
    {
      tokens: config.theme.tokens,
      breakpoints: config.theme.breakpoints,
      namedTemplates: collectNamedTemplates(config.theme.templates),
      blocks: config.theme.blocks,
      i18n: config.i18n,
      configuredSlots: configuredSlotsOf(config),
      refusedAdminAreas: config.runtime.refusedAdminAreas,
      theme: config.theme,
      routes: config.routes,
      projectRoot: cwd,
      bundledPluginsDir: ADMIN_BUNDLED_PLUGINS_DIR,
    },
  );

  return {
    configPath,
    runtime: config.runtime,
    manifest,
    registry,
    plugins: config.plugins,
    workerExports: config.runtime.workerExports ?? [],
    pluginCatalogFiles: await collectPluginCatalogFiles(config.plugins, cwd),
    editorBlockModules,
  };
}

// A sibling of publicDir, so the swap is a rename on one filesystem and the
// half-built copy is never served or watched.
function adminStagingRoot(projectRoot: string): string {
  return resolve(projectRoot, ".plumix/admin-staging");
}

function isInAdminStaging(projectRoot: string): (path: string) => boolean {
  const stagingRoot = adminStagingRoot(projectRoot);
  return (path) =>
    path === stagingRoot || path.startsWith(`${stagingRoot}${sep}`);
}

// Built in full outside publicDir and swapped in only when it differs, so an
// unchanged admin doesn't bounce Vite's file watcher.
async function stageAdminAssets(
  publicDir: string,
  manifest: PlumixManifest,
  plugins: readonly AnyPluginDescriptor[],
  registry: PluginRegistry,
  projectRoot: string,
  blockModules: readonly BlockModuleRef[],
): Promise<void> {
  await stageIntoPlace({
    stagingRoot: adminStagingRoot(projectRoot),
    dest: resolve(publicDir, "_plumix/admin"),
    populate: async (staging) => {
      await cp(ADMIN_SOURCE_DIR, staging, { recursive: true });
      await stageAdminInto(
        staging,
        manifest,
        plugins,
        registry,
        projectRoot,
        blockModules,
      );
    },
  });
}

async function stageAdminInto(
  dest: string,
  manifest: PlumixManifest,
  plugins: readonly AnyPluginDescriptor[],
  registry: PluginRegistry,
  projectRoot: string,
  blockModules: readonly BlockModuleRef[],
): Promise<void> {
  const chunks = await stagePluginChunks(dest, plugins, projectRoot);
  // Separate from chunk staging: a server-side-only plugin (no `adminChunk`)
  // can still contribute admin-rendered labels and needs its catalogs shipped.
  await stagePluginCatalogs(dest, plugins, manifest, projectRoot);
  // Plugins that ship `adminEntry` (TS source) get assembled into a
  // single per-site bundle with the runtime alias seam. Legacy
  // `adminChunk` (pre-built JS) plugins keep their existing path.
  const assembled = await assemblePluginAdminBundle({
    plugins,
    registry,
    adminDest: dest,
    projectRoot,
    blockModules,
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
        cssUrl = `${ADMIN_URL_PREFIX}/plugins/${plugin.id}.css`;
      }
      const pending: Promise<void>[] = [chunkCopy];
      if (cssCopy) pending.push(cssCopy);
      await Promise.all(pending);
      return {
        pluginId: plugin.id,
        chunkUrl: `${ADMIN_URL_PREFIX}/plugins/${plugin.id}.js`,
        cssUrl,
      };
    }),
  );
  chunks.push(...staged);
  return chunks;
}

// Copies each plugin's compiled `<catalogPath>/<locale>.mjs` to the
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
    throw VitePluginError.adminAssetNotFound({
      pluginId,
      field,
      declared: relOrAbs,
      resolved: source,
    });
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

type OnLog = NonNullable<
  NonNullable<BuildEnvironmentOptions["rolldownOptions"]>["onLog"]
>;

// Plumix gives `"use client"` its meaning itself, so Rolldown's directive
// warning is noise; @vitejs/plugin-react drops it too.
function withoutUseClientWarning(next: OnLog | undefined): OnLog {
  return (level, log, defaultHandler) => {
    if (
      level === "warn" &&
      log.code === "MODULE_LEVEL_DIRECTIVE" &&
      log.message.includes('"use client"')
    ) {
      return;
    }
    if (next) next(level, log, defaultHandler);
    else defaultHandler(level, log);
  };
}

// Per-island synthesized entry name. Used as the `rollupOptions.input`
// key so Rollup emits one content-hashed chunk per discovered island.
function islandEntryName(island: DiscoveredIsland): string {
  const slug = island.sourcePath.replace(/[^A-Za-z0-9]/g, "_");
  const suffix = simpleHash(island.sourcePath).toString(16).slice(0, 8);
  return `island-${slug}-${suffix}`;
}

function simpleHash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
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
    const adminPkgPath = require.resolve("@plumix/admin/package.json");
    const raw = readFileSync(adminPkgPath, "utf8");
    const parsed = v.safeParse(
      v.looseObject({ version: v.string() }),
      JSON.parse(raw),
    );
    return parsed.success ? parsed.output.version : null;
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

// Bounded so a stray large POST to the dev server can't grow memory unchecked.
const MAX_DEV_ERROR_BODY_BYTES = 1024 * 1024;
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let bytes = 0;
    req.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > MAX_DEV_ERROR_BODY_BYTES) {
        req.destroy();
        reject(new Error("dev-error request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export { plumix as default };
export { buildAppClientFirst } from "./build-order.js";
export type { BuildableApp } from "./build-order.js";
export { defineTestConfig } from "./test-config.js";
export { serverEnvironment } from "./server-environment.js";
export type { ServerEnvironmentOptions } from "./server-environment.js";
export { runBuildCommand } from "./build-command.js";
export type { BuildCommandOptions } from "./build-command.js";
export { runDevCommand } from "./dev-command.js";
export type { DevCommandOptions, DevEntry } from "./dev-command.js";
export type { DevListener, LoadedSite } from "./site-reloader.js";
