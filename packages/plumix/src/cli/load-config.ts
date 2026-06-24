import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";

import type { PlumixConfig } from "@plumix/core";
import { CliError } from "@plumix/core";

const CONFIG_CANDIDATES = [
  "plumix.config.ts",
  "plumix.config.js",
  "plumix.config.mjs",
] as const;

export interface LoadedConfig {
  readonly config: PlumixConfig;
  readonly configPath: string;
}

export interface LoadConfigOptions {
  /**
   * Bypass the cache and re-evaluate the config module, then refresh the cached
   * entry. The dev file-watcher passes this so an edit to `plumix.config.ts`
   * hot-reloads; cold-start callers omit it and share one evaluation.
   */
  readonly fresh?: boolean;
}

// One cold start fans `loadConfig` out across the CLI dispatch, the runtime
// adapter's pre-vite source emit, and the Vite plugin's `config()` +
// `buildStart()` hooks (the latter once per build environment) — ~8 calls for a
// build, each re-evaluating the config's whole JSX theme graph (`moduleCache:
// false`), ~12ms+ apiece. They all resolve to the same file in one process, so
// cache by absolute path. The watcher invalidates via `fresh` (see #1102), so
// config hot-reload still works — this is a watch-aware cache, not a plain memo.
const cache = new Map<string, LoadedConfig>();

export async function loadConfig(
  cwd: string,
  explicit?: string,
  options?: LoadConfigOptions,
): Promise<LoadedConfig> {
  const configPath = resolveConfigPath(cwd, explicit);
  if (!options?.fresh) {
    const cached = cache.get(configPath);
    if (cached) return cached;
  }

  const loaded = await evaluateConfig(configPath);
  cache.set(configPath, loaded);
  return loaded;
}

async function evaluateConfig(configPath: string): Promise<LoadedConfig> {
  const jiti = createJiti(pathToFileURL(configPath).href, {
    interopDefault: true,
    moduleCache: false,
    // Themes author templates as JSX, so the config's component graph must
    // parse at load time. jiti's transform is TS-only by default; enable its
    // JSX plugin (classic runtime — theme files import React, matching the
    // worker bundle's esbuild transform).
    jsx: true,
  });

  let imported: unknown;
  try {
    imported = await jiti.import(configPath, { default: true });
  } catch (cause) {
    throw CliError.configLoadFailed({ configPath, cause });
  }

  if (!isPlumixConfig(imported)) {
    throw CliError.configInvalid({ configPath });
  }

  return { config: imported, configPath };
}

export function resolveConfigPath(cwd: string, explicit?: string): string {
  if (explicit) {
    const absolute = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!existsSync(absolute)) {
      throw CliError.configNotFoundExplicit({ explicit, absolute });
    }
    return absolute;
  }

  for (const candidate of CONFIG_CANDIDATES) {
    const absolute = resolve(cwd, candidate);
    if (existsSync(absolute)) return absolute;
  }

  throw CliError.configNotFoundDefault({ cwd });
}

function isPlumixConfig(value: unknown): value is PlumixConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as Record<string, unknown>;
  const runtime = c.runtime as
    | { name?: unknown; buildFetchHandler?: unknown }
    | undefined;
  const database = c.database as { kind?: unknown } | undefined;
  const auth = c.auth as { passkey?: unknown } | undefined;
  return (
    typeof runtime?.name === "string" &&
    typeof runtime.buildFetchHandler === "function" &&
    typeof database?.kind === "string" &&
    !!auth?.passkey
  );
}
