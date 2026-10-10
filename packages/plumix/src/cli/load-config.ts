import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createJiti } from "jiti";
import * as v from "valibot";

import type { PlumixConfig } from "@plumix/core";

import { plumixPathAliases } from "../vite/path-aliases.js";
import { PlumixCliError } from "./errors.js";

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
   * Bypass the cache and re-evaluate the config module, refreshing the cached
   * entry.
   */
  readonly fresh?: boolean;
}

/**
 * One build calls `loadConfig` ~8 times, each re-evaluating the JSX theme
 * graph; cache by absolute path, invalidated through `fresh` for hot reload.
 */
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

  const loaded = await evaluateConfig(cwd, configPath);
  cache.set(configPath, loaded);
  return loaded;
}

async function evaluateConfig(
  cwd: string,
  configPath: string,
): Promise<LoadedConfig> {
  const jiti = createJiti(pathToFileURL(configPath).href, {
    interopDefault: true,
    // Disables only the eval cache so config edits hot-reload. Keep jiti's
    // `fsCache` on: it saves ~200ms off a warm cold start.
    moduleCache: false,
    // Themes author templates as JSX; classic runtime because theme files
    // import React.
    jsx: true,
    // The config imports the theme and every plugin, so a `~/` or `@/` import
    // anywhere in that graph has to resolve here, before Vite starts, exactly
    // as it does in the bundle.
    alias: Object.fromEntries(
      plumixPathAliases(cwd).map((a) => [a.find, a.replacement]),
    ),
  });

  let imported: unknown;
  try {
    imported = await jiti.import(configPath, { default: true });
  } catch (cause) {
    throw PlumixCliError.configLoadFailed({ configPath, cause });
  }

  if (!isPlumixConfig(imported)) {
    throw PlumixCliError.configInvalid({ configPath });
  }

  return { config: imported, configPath };
}

export function resolveConfigPath(cwd: string, explicit?: string): string {
  if (explicit) {
    const absolute = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!existsSync(absolute)) {
      throw PlumixCliError.configNotFoundExplicit({ explicit, absolute });
    }
    return absolute;
  }

  for (const candidate of CONFIG_CANDIDATES) {
    const absolute = resolve(cwd, candidate);
    if (existsSync(absolute)) return absolute;
  }

  throw PlumixCliError.configNotFoundDefault({ cwd });
}

/**
 * Only enough to tell a config from another export; the module itself is
 * returned, not this shape.
 */
const configShapeSchema = v.looseObject({
  runtime: v.looseObject({
    name: v.string(),
    handler: v.looseObject({}),
    generateEntry: v.function(),
  }),
  database: v.looseObject({ kind: v.string() }),
  auth: v.looseObject({
    passkey: v.pipe(v.unknown(), v.check(Boolean)),
  }),
});

function isPlumixConfig(value: unknown): value is PlumixConfig {
  return v.is(configShapeSchema, value);
}
