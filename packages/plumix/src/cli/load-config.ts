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

export async function loadConfig(
  cwd: string,
  explicit?: string,
): Promise<LoadedConfig> {
  const configPath = resolveConfigPath(cwd, explicit);

  const jiti = createJiti(pathToFileURL(configPath).href, {
    interopDefault: true,
    moduleCache: false,
  });

  let imported: unknown;
  try {
    imported = await jiti.import(configPath, { default: true });
  } catch (cause) {
    throw new CliError(`Failed to load ${configPath}`, {
      code: "CONFIG_LOAD_FAILED",
      hint: "Check the file for syntax errors and ensure every import resolves.",
      cause,
    });
  }

  if (!isPlumixConfig(imported)) {
    throw new CliError(`Invalid config shape in ${configPath}`, {
      code: "CONFIG_INVALID",
      hint: "Default export must be the return value of plumix({ ... }) or defineConfig({ ... }).",
    });
  }

  return { config: imported, configPath };
}

export function resolveConfigPath(cwd: string, explicit?: string): string {
  if (explicit) {
    const absolute = isAbsolute(explicit) ? explicit : resolve(cwd, explicit);
    if (!existsSync(absolute)) {
      throw new CliError(`Config file not found: ${explicit}`, {
        code: "CONFIG_NOT_FOUND",
        hint: `Checked ${absolute}`,
      });
    }
    return absolute;
  }

  for (const candidate of CONFIG_CANDIDATES) {
    const absolute = resolve(cwd, candidate);
    if (existsSync(absolute)) return absolute;
  }

  throw new CliError("No plumix.config.{ts,js,mjs} found", {
    code: "CONFIG_NOT_FOUND",
    hint: `Create plumix.config.ts in ${cwd} or pass --config <path>.`,
  });
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
