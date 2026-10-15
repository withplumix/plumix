import { getTableName } from "drizzle-orm";

import type { DumpReader, JsonValue, SyncRow, SyncValue } from "@plumix/core";
import { entries, settings, terms, users } from "@plumix/core/schema";

/** Where a site lives: its origin, and the base path it is served under. */
export interface SiteLocation {
  readonly origin: string;
  readonly basePath: string;
}

export interface RewrittenDump {
  readonly dump: DumpReader;
  /** Each table's rewritten values, counted on its latest read. */
  readonly rewritten: () => ReadonlyMap<string, number>;
}

/** The JSON content whose URLs a sync rewrites, by SQL table and column. */
const CONTENT_JSON_COLUMNS: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  [getTableName(entries), new Set([entries.content.name, entries.meta.name])],
  [getTableName(terms), new Set([terms.meta.name])],
  [getTableName(users), new Set([users.meta.name])],
  [getTableName(settings), new Set([settings.value.name])],
]);

export function siteUrl(site: SiteLocation): string {
  return `${new URL(site.origin).origin}${site.basePath}`;
}

/** A character that would carry on the host, port or last path segment. */
const CONTINUES = /[A-Za-z0-9\-._~:@%]/;
/** A character that would make the match part of a longer scheme or word. */
const PRECEDES = /[A-Za-z0-9+.-]/;

function replaceUrls(
  text: string,
  from: string,
  to: string,
): string | undefined {
  let changed = false;
  let result = "";
  let start = 0;
  let at = text.indexOf(from);
  while (at !== -1) {
    const before = text[at - 1];
    const after = text[at + from.length];
    const bounded =
      (before === undefined || !PRECEDES.test(before)) &&
      (after === undefined || !CONTINUES.test(after));
    if (bounded) {
      result += text.slice(start, at) + to;
      start = at + from.length;
      changed = true;
    }
    at = text.indexOf(from, at + from.length);
  }
  return changed ? result + text.slice(start) : undefined;
}

/** `Array.isArray` narrows a readonly array to `any[]`. */
function isJsonArray(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function rewriteJson(
  value: JsonValue,
  rewrite: (text: string) => string | undefined,
  count: () => void,
): JsonValue {
  if (typeof value === "string") {
    const rewritten = rewrite(value);
    if (rewritten === undefined) return value;
    count();
    return rewritten;
  }
  if (isJsonArray(value)) {
    return value.map((item) => rewriteJson(item, rewrite, count));
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteJson(item, rewrite, count),
      ]),
    );
  }
  return value;
}

function parseJson(text: string): JsonValue | undefined {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return undefined;
  }
}

/**
 * Walks parsed JSON rather than editing text, so a serialized structure can't
 * break. A cell nothing matched in keeps its bytes.
 */
export function rewriteUrls(
  dump: DumpReader,
  target: SiteLocation,
): RewrittenDump {
  const from = siteUrl(dump.manifest.source);
  const to = siteUrl(target);
  const rewrite = (text: string): string | undefined =>
    replaceUrls(text, from, to);
  const counts = new Map<string, number>();

  async function* rows(table: string): AsyncIterable<SyncRow> {
    const json = CONTENT_JSON_COLUMNS.get(table);
    counts.set(table, 0);
    const count = (): void => {
      counts.set(table, (counts.get(table) ?? 0) + 1);
    };
    for await (const row of dump.rows(table)) {
      if (json === undefined) {
        yield row;
        continue;
      }
      const out: Record<string, SyncValue> = { ...row };
      for (const column of json) {
        const cell = row[column];
        if (typeof cell !== "string") continue;
        const parsed = parseJson(cell);
        if (parsed === undefined) continue;
        const before = counts.get(table) ?? 0;
        const value = rewriteJson(parsed, rewrite, count);
        if (counts.get(table) !== before) out[column] = JSON.stringify(value);
      }
      yield out;
    }
  }

  return {
    dump: {
      manifest: dump.manifest,
      rows: (table) => (from === to ? dump.rows(table) : rows(table)),
      authors: () => dump.authors(),
      objects: () => dump.objects(),
    },
    rewritten: () => counts,
  };
}
