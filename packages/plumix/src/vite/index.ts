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
import { createRequire } from "node:module";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { SourceMapInput } from "@jridgewell/trace-mapping";
import type { IncomingMessage } from "node:http";
import type { Plugin, UserConfig } from "vite";
import * as v from "valibot";
import { mergeConfig } from "vite";

import type {
  AnyPluginDescriptor,
  PluginRegistry,
  PlumixManifest,
} from "@plumix/core";
import {
  collectNamedTemplates,
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
import { collectEditorBlockModules } from "./editor-block-modules.js";
import { generateEditorEntrySource } from "./editor-entry-codegen.js";
import { VitePluginError } from "./errors.js";
import {
  ORIG_QUERY,
  scanUserSources,
  SERIALIZE_VIRTUAL_ID,
  transformUseClientModule,
} from "./island-transform.js";
import { computeManifestAndRegistry } from "./manifest.js";
import { plumixPathAliases } from "./path-aliases.js";
import {
  findAdminBundledPluginsDir,
  stagePluginCatalogs,
} from "./plugin-catalog-resolve.js";
import { stageUserPublic } from "./public-staging.js";
import { generateWorkerExportsSource } from "./worker-exports-codegen.js";

// The pre-compiled admin SPA ships as its own package (@plumix/admin). Locate
// it so the vite plugin can stage its dist into the user's app, and so the
// catalogs it baked in can be told apart from the ones a site has to fetch.
// This relies on @plumix/admin exposing its package.json — it declares no
// `exports` map today; add a `"./package.json"` export if one is introduced.
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

export function plumix(options: PlumixVitePluginOptions = {}): Plugin {
  let root = process.cwd();
  let publicDir = "";
  let configPath: string | undefined;
  let command: "serve" | "build" = "serve";
  // Populated from `runtime.workerExports` on each regenerate; served by the
  // `virtual:plumix/worker-exports` module the generated worker re-exports.
  let workerExports: readonly string[] = [];
  // Discovered at config() time so rollupOptions.input can be extended
  // before Vite resolves entries.
  let islands: readonly DiscoveredIsland[] = [];

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
    async config(userConfig, env) {
      const define = {
        "process.env.WORKERS_CI": JSON.stringify(process.env.WORKERS_CI ?? ""),
        "process.env.WORKERS_CI_BRANCH": JSON.stringify(
          process.env.WORKERS_CI_BRANCH ?? "",
        ),
        // Used by `injectIslandsBootstrap` to pick between the dev
        // source-entry path and the hashed build manifest URL. Vite
        // substitutes this literal at bundle time so the SSR worker
        // gets a static boolean (no `process` lookup at runtime).
        "process.env.PLUMIX_DEV": JSON.stringify(
          env.command === "build" ? "" : "1",
        ),
        // The opt-out from the loopback-only gate on core's dev surfaces —
        // the debug bar, the request history, the dev error page and every
        // `auth: "development"` route (#2007). Set it to review on a phone,
        // demo through a tunnel or work in a codespace; empty in a production
        // build, where all of those tree-shake out regardless.
        "process.env.PLUMIX_DEV_ALLOW_REMOTE": JSON.stringify(
          env.command === "build"
            ? ""
            : (process.env.PLUMIX_DEV_ALLOW_REMOTE ?? ""),
        ),
        // The dev-only open-in-editor scheme (#1581). Substituted from the dev
        // machine's env at bundle time so the dev worker — whose `process.env`
        // is empty — can read it when rendering the dev error page. Empty in a
        // production build, where the whole dev-error path tree-shakes out.
        "process.env.PLUMIX_EDITOR": JSON.stringify(
          env.command === "build" ? "" : (process.env.PLUMIX_EDITOR ?? ""),
        ),
        // The dev-only open-in-editor path remap (#1627), for a dev server whose
        // filesystem differs from the editor host's (container / remote / dev-
        // container). Substituted from the dev machine's env at bundle time;
        // empty in a production build, where the dev-error path tree-shakes out.
        "process.env.PLUMIX_EDITOR_PATH_MAP": JSON.stringify(
          env.command === "build"
            ? ""
            : (process.env.PLUMIX_EDITOR_PATH_MAP ?? ""),
        ),
        // The dev-only browser-errors-to-terminal level (#1604). Substituted from
        // the dev machine's env at bundle time so the islands runtime knows what
        // to forward; empty in a production build, where the whole forwarder
        // tree-shakes out under the `PLUMIX_DEV` gate.
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
      // Register `.plumix/client-entry.ts` as the CLIENT environment's
      // entry. @cloudflare/vite-plugin checks for a non-empty
      // `clientEnvironment.config.build.rollupOptions.input` and only
      // falls back to its private `__cloudflare_fallback_entry__` when
      // none is set (see packages/vite-plugin-cloudflare/src/build.ts).
      // Vite merges this with the CF plugin's config; the merged
      // result has both `manifest: true` and our entry input.
      // Scan user source for islands BEFORE Vite resolves entries. Each
      // `"use client"` module becomes its own `rollupOptions.input` so
      // Vite emits one content-hashed chunk per island. The SSR shim
      // resolves chunk URLs from Vite's `.vite/manifest.json` at build
      // time (see `resolveIslandChunkUrl`).
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
              // Islands chunks (renderer + per-island components) are
              // dynamic-import targets reached only via runtime URLs, so
              // Rollup sees no static importer. Without strict signatures
              // the renderer entry — a pure side-effect-free re-export of
              // `mount` — tree-shakes to an empty chunk. `strict` keeps
              // every entry's exports intact.
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
        // Plumix ships its own dev browser-errors-to-terminal forwarder (#1604)
        // — tagged `[browser]`, collapsing repeats, tuned by
        // `PLUMIX_FORWARD_ERRORS`. Turn off Vite 8's native `forwardConsole` so
        // client output isn't printed twice (Vite's default auto-enables it when
        // it detects an AI agent driving the server). A user can re-enable it in
        // their own `vite` config, which merges after this.
        //
        // Turn off Vite's built-in compile-error overlay (#1622): the client
        // entry installs plumix's own overlay, which renders the same
        // `vite:error` payload through the shared dev error surface — the two
        // must not stack. A user can re-enable Vite's in their own config.
        server: { forwardConsole: false, hmr: { overlay: false } },
      };
      if (userConfig.publicDir === undefined) {
        base.publicDir = ".plumix/public";
      }
      // Served from the cold-start config cache (#1102) — populated by the CLI
      // dispatch / `emitPlumixSources` earlier in this same process. The dev
      // watcher in `configureServer` forces a fresh eval on edits, so config
      // hot-reload still works.
      const { config } = await loadConfig(scanRoot, options.configFile);
      return config.vite
        ? (mergeConfig(
            base,
            config.vite as Partial<UserConfig>,
          ) as Partial<UserConfig>)
        : base;
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
      // `<file>?plumix-orig` — the SSR shim imports the original module
      // from this virtual ID; `transform` short-circuits on it so the
      // shim isn't recursively wrapped. The shim emits an absolute path,
      // so passing `id` straight through resolves correctly.
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
      if (id === SERIALIZE_RESOLVED_ID) {
        // Re-export `IslandShim` (the SSR island runtime) resolved from the
        // project root, where `plumix` is always a dependency — so a "use
        // client" island in any package (core `@plumix/blocks` included)
        // gets a working import the SSR shim injected via
        // SERIALIZE_VIRTUAL_ID.
        return `export { IslandShim } from "plumix/blocks";`;
      }
      if (id === ASSET_MANIFEST_RESOLVED_ID) {
        // Read the manifest Vite emits to `<outDir>/.vite/manifest.json`.
        // Returns `{}` when missing — which happens in dev (no manifest
        // is written) AND on the FIRST production build of a fresh
        // project: @cloudflare/vite-plugin builds the worker env before
        // the client env, so on a cold build the worker bakes an empty
        // manifest and the second build picks up the real entries.
        // Followup #528 tracks the fix.
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
      warnOnPluginAdminMismatch(emitted.plugins, this.warn.bind(this));
      // User `public/` is staged BEFORE admin so the admin SPA's
      // freshness check still works against its own source mtime —
      // and the `_plumix/` filter in `stageUserPublic` keeps users
      // from corrupting admin's subtree on collision.
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
      // The dev source-frame resolver (#1583, #1596): the dev error page ships
      // resolved `file:line` positions and lazy-fetches each frame's source
      // excerpt from here, since the worker has no `fs`. Registered before the
      // @cloudflare/vite-plugin proxy (plumix is ordered ahead of it), so this
      // dev-only endpoint is answered here and never reaches the worker.
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

      // Register a dev-only endpoint that reads a JSON POST body and answers with
      // JSON. Ordered ahead of the worker proxy (plumix precedes it), so these
      // never reach the worker.
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

      // The client-stack resolver (#1572, #1603): the island error overlay POSTs
      // its raw browser stack here to get original-source frames, since the
      // worker (and the browser) can't map the transformed positions — only the
      // dev server's per-module sourcemaps can.
      usePostJson(DEV_ERROR_STACK_ENDPOINT, (body) =>
        handleDevErrorStackRequest(body, { lookup }),
      );

      // Browser-errors-to-terminal (#1604): the islands runtime POSTs batches of
      // client failures (uncaught exceptions + `console.error`/`warn`) here, and
      // the forwarder sourcemaps each stack through the same `lookup` and prints
      // it into this terminal tagged `[browser]`, collapsing consecutive
      // identical entries. One instance per dev session holds the collapse state.
      const forwarder = createTerminalForwarder({
        resolveStack: (stack) => resolveClientStack(stack, { lookup }),
        print: (message) => server.config.logger.info(message),
        root: server.config.root,
      });
      usePostJson(DEV_ERROR_TERMINAL_ENDPOINT, (body) =>
        forwarder.handle(body),
      );

      // The retained-client-errors read endpoint (#1656): a GET that returns the
      // forwarder's bounded ring of already-sourcemapped client failures,
      // newest-first, for the dev-only MCP `error_list` tool (#1653) to merge
      // with its server-side projection. Read-only, so no request body.
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
 * Pre-emit `.plumix/worker.ts` (the runtime adapter's entry) and
 * `.plumix/schema.ts` from the user's config. Exposed so the runtime adapter
 * CLI can force the files into existence before handing plugins to
 * `vite.build` / `vite.createServer` — peer plugins (notably
 * @cloudflare/vite-plugin) validate wrangler.jsonc's `main` path early, and
 * expect that file to already exist.
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
  // The dev watcher forces a fresh config eval on `plumix.config.ts` edits;
  // cold-start callers share the cached one (#1102).
  options?: LoadConfigOptions,
): Promise<{
  configPath: string;
  manifest: PlumixManifest;
  registry: PluginRegistry;
  plugins: readonly AnyPluginDescriptor[];
  workerExports: readonly string[];
  editorBlockModules: readonly BlockModuleRef[];
}> {
  const { config, configPath } = await loadConfig(cwd, explicitConfig, options);

  const schemaSource = generateSchemaSource(config).source;
  writeIfChanged(resolve(cwd, ".plumix/schema.ts"), schemaSource);

  const entrySource = config.runtime.generateEntry({
    configModule: resolveConfigSpecifier(cwd, configPath),
  });
  writeIfChanged(resolve(cwd, ".plumix/worker.ts"), entrySource);

  // Always emit `.plumix/client-entry.ts`, even when empty. The plumix
  // Vite plugin's `config()` hook unconditionally lists it as a client
  // entry — Vite resolves entries during the build pass (after
  // `buildStart`), so this file just needs to exist before then. CSS
  // imports declared in `theme.css` (Nuxt-style string array) land in
  // the client bundle through this entry's import graph; jiti never
  // sees them, so themes can import arbitrary asset types without
  // hitting the config loader.
  const clientEntrySource = generateClientEntrySource(config.theme.css ?? []);
  writeIfChanged(resolve(cwd, ".plumix/client-entry.ts"), clientEntrySource);

  // Always-emit islands runtime entry. The file is bundled as its own
  // client chunk (`plumix-islands-runtime` in rollupOptions.input) so
  // the SSR layer can inject `<script src="<hashed-url>">` only on
  // pages that contain at least one `<plumix-island>`. Importing the
  // runtime is a side-effect — it registers the custom element +
  // strategies on `self.Plumix` + `customElements`.
  writeIfChanged(
    resolve(cwd, ".plumix/islands-entry.ts"),
    `// Generated by plumix — do not edit.\nimport "plumix/blocks/island-runtime";\n`,
  );

  // Always-emit islands renderer entry — the React + ReactDOM half of the
  // runtime, bundled as its own `plumix-islands-renderer` client chunk.
  // The custom element dynamic-imports it on first hydration (URL threaded
  // via the bootstrap script), so React is fetched only when an island
  // actually hydrates — never on a page whose islands all defer.
  writeIfChanged(
    resolve(cwd, ".plumix/islands-renderer-entry.ts"),
    `// Generated by plumix — do not edit.\nexport * from "plumix/blocks/island-renderer";\n`,
  );

  // Always-emit editor runtime entry — bundled as the `plumix-editor` client
  // chunk. Its `bootEditor()` call mounts the canvas into the SSR
  // `data-plumix-content-root`; the SSR layer injects this chunk only when the
  // edit gate authorizes it. Theme blocks (its `blocks` field) and plugin blocks
  // (their `ctx.registerBlock(s)` calls) are recovered from config source and
  // resolved to importable paths so the canvas renders them, not just core.
  const editorBlockModules = collectEditorBlockModules(
    configPath,
    readFileSync(configPath, "utf8"),
  );
  writeIfChanged(
    resolve(cwd, ".plumix/editor-entry.ts"),
    generateEditorEntrySource(editorBlockModules),
  );

  const { manifest, registry } = await computeManifestAndRegistry(
    config.plugins,
    {
      tokens: config.theme.tokens,
      breakpoints: config.theme.breakpoints,
      namedTemplates: collectNamedTemplates(config.theme.templates),
      blocks: config.theme.blocks,
      i18n: config.i18n,
      theme: config.theme,
      projectRoot: cwd,
      bundledPluginsDir: ADMIN_BUNDLED_PLUGINS_DIR,
    },
  );

  return {
    configPath,
    manifest,
    registry,
    plugins: config.plugins,
    workerExports: config.runtime.workerExports ?? [],
    editorBlockModules,
  };
}

// Copies the compiled admin SPA from the @plumix/admin package into the
// effective publicDir under _plumix/admin/. The runtime adapter's asset-serving layer
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
  blockModules: readonly BlockModuleRef[],
): Promise<void> {
  const dest = resolve(publicDir, "_plumix/admin");
  if (!(await destIsFresh(dest, ADMIN_SOURCE_DIR))) {
    await rm(dest, { recursive: true, force: true });
    await cp(ADMIN_SOURCE_DIR, dest, { recursive: true });
  }
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

// Resolve a `"use client"` module's chunk URL for the shim's
// `<plumix-island chunk-url="…">` attribute.
//
// Dev (`serve`): `/@fs<absolute-id>` — Vite serves the original
// module via its dev-server middleware. The custom element's dynamic
// `import()` loads it through Vite's module graph so HMR plumbing
// works (full-page reload on edit; live patch isn't supported across
// the island boundary).
//
// Build: look up the per-island Rollup input by its
// `islandEntryName` and emit the hashed `file:` from Vite's
// `.vite/manifest.json`. Falls back to `/@fs<id>` if the manifest
// entry is missing (cold-build edge case the asset-manifest virtual
// module already documents).
export function resolveIslandChunkUrl(
  id: string,
  command: "serve" | "build",
  rootDir: string,
): string {
  if (command === "serve") return "/@fs" + id;
  const manifest = loadAssetManifest(rootDir);
  // Vite's manifest keys source paths relative to the project root,
  // not by the `rollupOptions.input` name. Compute the relative POSIX
  // path so the lookup matches.
  const relativeId = relative(rootDir, id).replace(/\\/g, "/");
  const entry = manifest[relativeId];
  if (entry?.file) return "/" + entry.file;
  return "/@fs" + id;
}

/**
 * The slice of Vite's `manifest.json` the island chunk lookup reads: source
 * path → the chunk it built into. A missing file reads as an empty manifest,
 * which is the cold-build case the virtual module already documents.
 */
type AssetManifest = Readonly<Record<string, { readonly file?: string }>>;

function loadAssetManifest(rootDir: string): AssetManifest {
  const candidates = [
    resolve(rootDir, "dist/client/.vite/manifest.json"),
    resolve(rootDir, "dist/.vite/manifest.json"),
  ];
  for (const path of candidates) {
    try {
      return JSON.parse(readFileSync(path, "utf8")) as AssetManifest;
    } catch {
      continue;
    }
  }
  return {};
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

// Read a request body to a string — the dev-error stack endpoint POSTs a small
// JSON payload, so buffering it whole is fine, bounded so a stray large POST to
// the dev server can't grow memory unchecked.
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

export { assemblePluginAdminBundle } from "./admin-plugin-bundle.js";
export { plumix as default };
