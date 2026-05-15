import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ParseError } from "jsonc-parser";
import { parse as parseJsonc } from "jsonc-parser";
import { parse as parseToml } from "smol-toml";

import { WranglerConfigError } from "./errors.js";

interface D1BindingEntry {
  readonly binding?: string;
  readonly database_name?: string;
  readonly database_id?: string;
}

// Wrangler's config search order — first match wins.
const WRANGLER_FILENAMES = ["wrangler.jsonc", "wrangler.json", "wrangler.toml"];

interface LoadedWranglerConfig {
  readonly filename: string;
  readonly d1Databases: readonly D1BindingEntry[];
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

    const rawD1 = (parsed as { d1_databases?: unknown }).d1_databases;
    const d1Databases: D1BindingEntry[] = Array.isArray(rawD1)
      ? rawD1.filter(
          (entry): entry is D1BindingEntry =>
            typeof entry === "object" &&
            entry !== null &&
            !Array.isArray(entry),
        )
      : [];

    return { filename, d1Databases };
  }
  return null;
}

function tryRead(path: string): string | null {
  try {
    return readFileSync(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function parseJsoncStrict(text: string, filename: string): unknown {
  const errors: ParseError[] = [];
  const value: unknown = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw WranglerConfigError.parseFailed({
      filename,
      errorCount: errors.length,
    });
  }
  return value;
}
