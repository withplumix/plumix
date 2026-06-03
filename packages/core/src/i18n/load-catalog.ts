import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

/** Shape `@lingui/cli compile --namespace json` produces: each msgid
 *  maps to a string (plain messages) or an array of tokens (messages
 *  with placeholders / JSX). Structural match for Lingui's `Messages`
 *  type — kept free of `@lingui/core` to avoid pulling Lingui into
 *  `@plumix/core`'s dep tree; consumers can pass the result straight
 *  to `i18n.load(locale, catalog)`.
 *
 *  Internal because load-catalog is server-only and the i18n barrel
 *  intentionally stays browser-safe ([[core-subpath-imports]]). A
 *  future server consumer that imports load-catalog.ts directly picks
 *  the type up via TypeScript inference from `createCatalogLoader`'s
 *  return type.
 */
type CatalogJSON = Readonly<
  Record<string, string | readonly (string | readonly unknown[])[]>
>;

interface LoadCatalogInput {
  readonly locale: string;
  readonly bundledPath: string;
}

type CatalogLoader = (input: LoadCatalogInput) => Promise<CatalogJSON | null>;

export class CatalogParseError extends Error {
  readonly path: string;
  constructor(path: string, cause: unknown) {
    super(`Failed to parse catalog: ${path}`, { cause });
    this.name = "CatalogParseError";
    this.path = path;
  }
}

function isFileNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

// Hit carries the parsed catalog plus the mtime that minted it; miss
// short-circuits future calls without re-stat'ing.
type CacheEntry =
  | {
      readonly kind: "hit";
      readonly mtimeMs: number;
      readonly catalog: CatalogJSON;
    }
  | { readonly kind: "miss" };

export function createCatalogLoader(): CatalogLoader {
  const cache = new Map<string, CacheEntry>();
  return async (input) => {
    const path = join(input.bundledPath, `${input.locale}.json`);
    const cached = cache.get(path);
    if (cached?.kind === "miss") return null;
    let mtimeMs: number;
    try {
      mtimeMs = (await stat(path)).mtimeMs;
    } catch (error) {
      if (isFileNotFound(error)) {
        cache.set(path, { kind: "miss" });
        return null;
      }
      throw error;
    }
    if (cached?.kind === "hit" && cached.mtimeMs === mtimeMs) {
      return cached.catalog;
    }
    // Best-effort under concurrent replacement: a file swapped between
    // `stat` and `readFile` ends up cached against the pre-swap mtime,
    // self-healing on the next call. Acceptable for the boot-time
    // catalog posture.
    const content = await readFile(path, "utf8");
    let catalog: CatalogJSON;
    try {
      catalog = JSON.parse(content) as CatalogJSON;
    } catch (cause) {
      throw new CatalogParseError(path, cause);
    }
    cache.set(path, { kind: "hit", mtimeMs, catalog });
    return catalog;
  };
}
