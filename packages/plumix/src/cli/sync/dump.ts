import { once } from "node:events";
import {
  createReadStream,
  createWriteStream,
  existsSync,
  statSync,
} from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import * as v from "valibot";

import type {
  DumpManifest,
  DumpReader,
  DumpTableCount,
  DumpWriter,
  SyncObject,
  SyncRow,
  SyncValue,
} from "@plumix/core";

import { PlumixCliError } from "../errors.js";

const MANIFEST_FILE = "manifest.json";
const PROGRESS_FILE = "progress.json";
const AUTHORS_FILE = "authors.ndjson";
const OBJECTS_DIR = "objects";
const OBJECT_INDEX_FILE = `${OBJECTS_DIR}/index.ndjson`;

/** A table name becomes a file name, so it may not leave the dump. */
const TABLE_NAME = /^[A-Za-z0-9_]+$/;

/** What the writer can't count itself: who exported, and in what state. */
export type DumpHeader = Pick<DumpManifest, "source" | "scopes" | "heads">;

export interface DirectoryDumpWriter extends DumpWriter {
  /** Writes `manifest.json`; the dump is readable only after it. */
  finish(): Promise<DumpManifest>;
}

/** What an unfinished dump holds: its header and each table written whole. */
export interface DumpProgress {
  readonly header: DumpHeader;
  readonly tables: readonly DumpTableCount[];
  /** Whether `manifest.json` was written, so nothing is left to export. */
  readonly finished: boolean;
}

const ManifestSchema = v.object({
  format: v.literal(1),
  source: v.object({ origin: v.string(), basePath: v.string() }),
  scopes: v.array(v.string()),
  tables: v.array(
    v.object({
      name: v.pipe(v.string(), v.regex(TABLE_NAME)),
      rows: v.pipe(v.number(), v.integer(), v.minValue(0)),
    }),
  ),
  authors: v.pipe(v.number(), v.integer(), v.minValue(0)),
  objects: v.pipe(v.number(), v.integer(), v.minValue(0)),
  heads: v.record(v.string(), v.nullable(v.string())),
});

const ObjectEntrySchema = v.object({
  key: v.string(),
  file: v.pipe(v.string(), v.regex(/^[0-9]+$/)),
  contentType: v.optional(v.string()),
  size: v.pipe(v.number(), v.integer(), v.minValue(0)),
});

type ObjectEntry = v.InferOutput<typeof ObjectEntrySchema>;

/** A SQLite value as a dump line holds it: a BLOB is its bytes in base64. */
const DumpValueSchema = v.union([
  v.string(),
  v.number(),
  v.null(),
  v.object({ $blob: v.string() }),
]);

const DumpRowSchema = v.record(v.string(), DumpValueSchema);

type DumpValue = v.InferOutput<typeof DumpValueSchema>;

function encodeValue(value: SyncValue): DumpValue {
  if (value instanceof Uint8Array) {
    return { $blob: Buffer.from(value).toString("base64") };
  }
  return value;
}

function decodeValue(value: DumpValue): SyncValue {
  if (value === null || typeof value !== "object") return value;
  return new Uint8Array(Buffer.from(value.$blob, "base64"));
}

function encodeRow(row: SyncRow): string {
  const encoded = Object.fromEntries(
    Object.entries(row).map(([column, value]) => [column, encodeValue(value)]),
  );
  return JSON.stringify(encoded);
}

function tableFile(name: string): string {
  return `${name}.ndjson`;
}

async function writeLines(
  path: string,
  rows: AsyncIterable<SyncRow>,
): Promise<number> {
  let count = 0;
  async function* lines(): AsyncIterable<string> {
    for await (const row of rows) {
      count += 1;
      yield `${encodeRow(row)}\n`;
    }
  }
  await pipeline(Readable.from(lines()), createWriteStream(path));
  return count;
}

async function writeProgress(
  dir: string,
  header: DumpHeader,
  tables: readonly DumpTableCount[],
): Promise<void> {
  await writeFile(
    join(dir, PROGRESS_FILE),
    `${JSON.stringify({ header, tables })}\n`,
  );
}

/** The keys an unfinished dump's index already holds, which it keeps. */
async function indexedKeys(dir: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const path = join(dir, OBJECT_INDEX_FILE);
  if (!existsSync(path)) return keys;
  for await (const line of readLines(path)) {
    keys.add(
      parseLine(OBJECT_INDEX_FILE, line, ObjectEntrySchema, (issues) =>
        v.summarize(issues),
      ).key,
    );
  }
  return keys;
}

/**
 * Writes a dump to `dir` as rows arrive, so no table has to fit in memory.
 * Objects are numbered files, keyed only in the index. What `kept` holds stays
 * unread.
 */
export function writeDump(
  dir: string,
  header: DumpHeader,
  kept?: DumpProgress,
): DirectoryDumpWriter {
  const tables: DumpTableCount[] = [];
  const keptTables = new Map(
    (kept?.tables ?? []).map((table) => [table.name, table.rows]),
  );
  let authors = 0;
  let objects = 0;
  let keptKeys = new Set<string>();
  const ready = (async () => {
    await mkdir(join(dir, OBJECTS_DIR), { recursive: true });
    if (kept === undefined) {
      await writeFile(join(dir, OBJECT_INDEX_FILE), "");
    } else {
      keptKeys = await indexedKeys(dir);
      objects = keptKeys.size;
    }
    await writeProgress(dir, header, tables);
  })();
  return {
    async table(name, rows) {
      await ready;
      const keptRows = keptTables.get(name);
      tables.push({
        name,
        rows: keptRows ?? (await writeLines(join(dir, tableFile(name)), rows)),
      });
      await writeProgress(dir, header, tables);
    },
    async authors(rows) {
      await ready;
      authors = await writeLines(join(dir, AUTHORS_FILE), rows);
    },
    async object(key, body, contentType) {
      await ready;
      if (keptKeys.has(key)) {
        await body.cancel();
        return;
      }
      objects += 1;
      const file = String(objects);
      const path = join(dir, OBJECTS_DIR, file);
      await pipeline(
        Readable.fromWeb(body as Parameters<typeof Readable.fromWeb>[0]),
        createWriteStream(path),
      );
      const entry: ObjectEntry = {
        key,
        file,
        ...(contentType !== undefined && { contentType }),
        size: statSync(path).size,
      };
      await appendFile(
        join(dir, OBJECT_INDEX_FILE),
        `${JSON.stringify(entry)}\n`,
      );
    },
    async finish() {
      await ready;
      const manifest: DumpManifest = {
        format: 1,
        source: header.source,
        scopes: header.scopes,
        tables,
        authors,
        objects,
        heads: header.heads,
      };
      await writeFile(
        join(dir, MANIFEST_FILE),
        `${JSON.stringify(manifest, null, 2)}\n`,
      );
      return manifest;
    },
  };
}

async function* readLines(path: string): AsyncIterable<string> {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  for await (const line of lines) {
    if (line !== "") yield line;
  }
}

function invalid(file: string, detail: string): PlumixCliError {
  return PlumixCliError.syncDumpInvalid({ file, detail });
}

async function readManifest(dir: string): Promise<DumpManifest> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(dir, MANIFEST_FILE), "utf8"));
  } catch (cause) {
    throw invalid(
      MANIFEST_FILE,
      cause instanceof Error ? cause.message : String(cause),
    );
  }
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "format" in parsed &&
    parsed.format !== 1
  ) {
    throw invalid(
      MANIFEST_FILE,
      `format ${JSON.stringify(parsed.format)} is not one this release reads (1)`,
    );
  }
  const result = v.safeParse(ManifestSchema, parsed);
  if (!result.success) {
    throw invalid(MANIFEST_FILE, v.summarize(result.issues));
  }
  return result.output;
}

async function countLines(dir: string, file: string): Promise<number> {
  const path = join(dir, file);
  if (!existsSync(path)) throw invalid(file, "the file is missing");
  let count = 0;
  for await (const line of readLines(path)) {
    void line;
    count += 1;
  }
  return count;
}

async function checkCount(
  dir: string,
  file: string,
  expected: number,
): Promise<void> {
  const counted = await countLines(dir, file);
  if (counted !== expected) {
    throw invalid(
      file,
      `it holds ${String(counted)} rows, the manifest says ${String(expected)}`,
    );
  }
}

function parseLine<S extends v.GenericSchema>(
  file: string,
  line: string,
  schema: S,
  mismatch: (
    issues: [v.BaseIssue<unknown>, ...v.BaseIssue<unknown>[]],
  ) => string,
): v.InferOutput<S> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch (cause) {
    throw invalid(file, cause instanceof Error ? cause.message : String(cause));
  }
  const result = v.safeParse(schema, parsed);
  if (!result.success) throw invalid(file, mismatch(result.issues));
  return result.output;
}

function parseRow(file: string, line: string): SyncRow {
  const row = parseLine(
    file,
    line,
    DumpRowSchema,
    () => "a line is not a row of SQLite values",
  );
  return Object.fromEntries(
    Object.entries(row).map(([column, value]) => [column, decodeValue(value)]),
  );
}

async function* rowsIn(dir: string, file: string): AsyncIterable<SyncRow> {
  const path = join(dir, file);
  if (!existsSync(path)) return;
  for await (const line of readLines(path)) yield parseRow(file, line);
}

async function objectIndex(
  dir: string,
  expected: number,
): Promise<ObjectEntry[]> {
  const path = join(dir, OBJECT_INDEX_FILE);
  if (expected === 0 && !existsSync(path)) return [];
  if (!existsSync(path))
    throw invalid(OBJECT_INDEX_FILE, "the file is missing");
  const entries: ObjectEntry[] = [];
  for await (const line of readLines(path)) {
    const entry = parseLine(
      OBJECT_INDEX_FILE,
      line,
      ObjectEntrySchema,
      (issues) => v.summarize(issues),
    );
    const file = `${OBJECTS_DIR}/${entry.file}`;
    const objectPath = join(dir, file);
    if (!existsSync(objectPath)) throw invalid(file, "the file is missing");
    if (statSync(objectPath).size !== entry.size) {
      throw invalid(file, "its size disagrees with the index");
    }
    entries.push(entry);
  }
  if (entries.length !== expected) {
    throw invalid(
      OBJECT_INDEX_FILE,
      `it lists ${String(entries.length)} objects, the manifest says ${String(expected)}`,
    );
  }
  return entries;
}

/**
 * Opens a dump, checking its manifest and every count against the files
 * before anything is read from it.
 */
export async function readDump(dir: string): Promise<DumpReader> {
  const manifest = await readManifest(dir);
  for (const table of manifest.tables) {
    await checkCount(dir, tableFile(table.name), table.rows);
  }
  if (manifest.authors > 0 || existsSync(join(dir, AUTHORS_FILE))) {
    await checkCount(dir, AUTHORS_FILE, manifest.authors);
  }
  const index = await objectIndex(dir, manifest.objects);
  const tables = new Set(manifest.tables.map((table) => table.name));
  return {
    manifest,
    rows(table) {
      if (!tables.has(table)) {
        throw invalid(MANIFEST_FILE, `it lists no table "${table}"`);
      }
      return rowsIn(dir, tableFile(table));
    },
    authors: () => rowsIn(dir, AUTHORS_FILE),
    async *objects(): AsyncIterable<SyncObject> {
      for (const entry of index) {
        const stream = createReadStream(join(dir, OBJECTS_DIR, entry.file));
        // Opened before it is handed on, so a file gone since the dump was
        // checked fails here rather than partway through the target's write.
        await once(stream, "open");
        yield {
          key: entry.key,
          body: Readable.toWeb(stream) as ReadableStream<Uint8Array>,
          ...(entry.contentType !== undefined && {
            contentType: entry.contentType,
          }),
        };
      }
    },
  };
}

const ProgressSchema = v.object({
  header: v.object({
    source: ManifestSchema.entries.source,
    scopes: ManifestSchema.entries.scopes,
    heads: ManifestSchema.entries.heads,
  }),
  tables: ManifestSchema.entries.tables,
});

/**
 * How far the export into `dir` got, or `null` for a directory that is not a
 * dump this release wrote.
 */
export async function readDumpProgress(
  dir: string,
): Promise<DumpProgress | null> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(join(dir, PROGRESS_FILE), "utf8"));
  } catch {
    return null;
  }
  const result = v.safeParse(ProgressSchema, parsed);
  if (!result.success) return null;
  return {
    ...result.output,
    finished: existsSync(join(dir, MANIFEST_FILE)),
  };
}
