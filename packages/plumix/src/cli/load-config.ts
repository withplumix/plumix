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
