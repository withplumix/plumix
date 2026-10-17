import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParseError } from "jsonc-parser";
import type { JsonValue } from "plumix";
import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

import { WranglerConfigError } from "./errors.js";

export interface D1BindingEntry {
  readonly binding?: string;
  readonly database_name?: string;
  readonly database_id?: string;
  /** The database `wrangler dev` opens in place of `database_id`. */
  readonly preview_database_id?: string;
}

/** A block's `previews`: absent, a Worker Preview takes the top level's. */
interface WranglerPreviews {
  readonly d1Databases: readonly D1BindingEntry[];
}

interface WranglerEnvironment {
  readonly name: string;
  readonly d1Databases: readonly D1BindingEntry[];
  readonly previews?: WranglerPreviews;
}

/** Wrangler's config search order — first match wins. */
const WRANGLER_FILENAMES = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];

export interface LoadedWranglerConfig {
  readonly filename: string;
  readonly d1Databases: readonly D1BindingEntry[];
  readonly previews?: WranglerPreviews;
  readonly environments: readonly WranglerEnvironment[];
  readonly compatibilityDate?: string;
  readonly accountId?: string;
  /** Whether Workers Logs keeps the deployed Worker's logs. */
  readonly observabilityEnabled: boolean;
  /** Whether Workers Caching (`cache.enabled`) sits in front of the Worker. */
  readonly workersCachingEnabled: boolean;
}

/**
 * Locate and parse the wrangler config in `cwd`. Returns null if none of
 * `wrangler.jsonc`, `wrangler.json`, `wrangler.toml` is present. Throws
 * if a file is present but unparseable.
 */
export function loadWranglerConfig(cwd: string): LoadedWranglerConfig | null {
  for (const filename of WRANGLER_FILENAMES) {
    const path = join(cwd, filename);
    const text = tryRead(path);
    if (text === null) continue;

    const parsed = filename.endsWith(".toml")
      ? parseToml(text)
      : parseJsoncStrict(text, filename);

    const previews = previewsOf(parsed);
    const { compatibility_date: compatibilityDate, account_id: accountId } =
      parsed as { compatibility_date?: unknown; account_id?: unknown };
    const { observability, cache } = parsed as {
      observability?: unknown;
      cache?: unknown;
    };
    return {
      filename,
      d1Databases: d1DatabasesOf(parsed),
      ...(previews === undefined ? {} : { previews }),
      environments: environmentsOf(parsed),
      observabilityEnabled: isEnabled(observability),
      workersCachingEnabled: isEnabled(cache),
      ...(typeof compatibilityDate === "string" ? { compatibilityDate } : {}),
      ...(typeof accountId === "string" ? { accountId } : {}),
    };
  }
  return null;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function d1DatabasesOf(block: unknown): D1BindingEntry[] {
  const raw = isObject(block) ? block.d1_databases : undefined;
  return Array.isArray(raw)
    ? raw.filter((entry): entry is D1BindingEntry => isObject(entry))
    : [];
}

function previewsOf(block: unknown): WranglerPreviews | undefined {
  const previews = isObject(block) ? block.previews : undefined;
  if (!isObject(previews)) return undefined;
  return { d1Databases: d1DatabasesOf(previews) };
}

function environmentsOf(parsed: unknown): WranglerEnvironment[] {
  const env = isObject(parsed) ? parsed.env : undefined;
  if (!isObject(env)) return [];
  return Object.entries(env).map(([name, block]) => {
    const previews = previewsOf(block);
    return {
      name,
      d1Databases: d1DatabasesOf(block),
      ...(previews === undefined ? {} : { previews }),
    };
  });
}

function isEnabled(block: unknown): boolean {
  return (
    typeof block === "object" &&
    block !== null &&
    (block as { enabled?: unknown }).enabled === true
  );
}

function tryRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function parseJsoncStrict(text: string, filename: string): JsonValue {
  const errors: ParseError[] = [];
  const value = parseJsonc(text, errors, {
    allowTrailingComma: true,
  }) as JsonValue;
  if (errors.length > 0) {
    throw WranglerConfigError.parseFailed({
      filename,
      errorCount: errors.length,
    });
  }
  return value;
}
