import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import * as v from "valibot";

import type {
  ImportedMeta,
  ImportedMetaOwner,
  JsonObject,
  PluginRegistry,
  SyncRow,
} from "@plumix/core";

import { PlumixCliError } from "../errors.js";

const Text = v.pipe(v.string(), v.minLength(1));

const Bag = v.record(v.string(), v.unknown());

const TermRef = v.strictObject({ taxonomy: Text, slug: Text });

const TermRecord = v.strictObject({
  type: v.literal("term"),
  taxonomy: Text,
  slug: Text,
  name: Text,
  description: v.optional(v.string()),
  meta: v.optional(Bag),
});

const EntryRecord = v.strictObject({
  type: v.literal("entry"),
  entryType: Text,
  slug: Text,
  title: v.string(),
  author: v.pipe(v.string(), v.email()),
  content: v.optional(v.nullable(Bag)),
  excerpt: v.optional(v.string()),
  status: v.optional(v.picklist(["draft", "published"])),
  publishedAt: v.optional(v.pipe(v.string(), v.isoTimestamp())),
  meta: v.optional(Bag),
  terms: v.optional(v.array(TermRef)),
});

const AuthoringRecord = v.variant("type", [TermRecord, EntryRecord]);

type TermRecord = v.InferOutput<typeof TermRecord>;
type EntryRecord = v.InferOutput<typeof EntryRecord>;

type CheckMeta = (
  owner: ImportedMetaOwner,
  meta: JsonObject,
) => Promise<ImportedMeta>;

/** The rows an authoring file loads, in the dump's terms. */
export interface AuthoringRows {
  readonly terms: readonly SyncRow[];
  readonly entries: readonly SyncRow[];
  readonly entryTerms: readonly SyncRow[];
  readonly authors: readonly SyncRow[];
}

interface ReadAuthoringOptions {
  readonly registry: PluginRegistry;
  readonly checkMeta: CheckMeta;
  readonly slugify: (text: string) => string;
  /** What a published record without `publishedAt` is published at. */
  readonly now: Date;
}

interface Located<T> {
  readonly line: number;
  readonly record: T;
}

async function* numberedLines(
  path: string,
): AsyncIterable<{ line: number; text: string }> {
  const lines = createInterface({
    input: createReadStream(path),
    crlfDelay: Infinity,
  });
  let line = 0;
  for await (const text of lines) {
    line += 1;
    if (text.trim() !== "") yield { line, text };
  }
}

type Fail = (line: number, reason: string) => void;

interface ParsedRecords {
  readonly terms: readonly Located<TermRecord>[];
  readonly entries: readonly Located<EntryRecord>[];
}

function seconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function slugKey(owner: string, slug: string): string {
  return `${owner}/${slug}`;
}

async function parseRecords(path: string, fail: Fail): Promise<ParsedRecords> {
  const terms: Located<TermRecord>[] = [];
  const entries: Located<EntryRecord>[] = [];
  for await (const { line, text } of numberedLines(path)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      fail(line, "the line is not JSON");
      continue;
    }
    const result = v.safeParse(AuthoringRecord, parsed);
    if (!result.success) {
      fail(line, v.summarize(result.issues).replaceAll("\n", "; "));
      continue;
    }
    if (result.output.type === "term") {
      terms.push({ line, record: result.output });
    } else {
      entries.push({ line, record: result.output });
    }
  }
  return { terms, entries };
}

interface TermRows {
  readonly rows: readonly SyncRow[];
  readonly ids: ReadonlyMap<string, number>;
  /** Keys of the terms that failed, which their entries need not report again. */
  readonly failed: ReadonlySet<string>;
}

async function termRowsOf(
  terms: readonly Located<TermRecord>[],
  options: ReadAuthoringOptions,
  fail: Fail,
): Promise<TermRows> {
  const lines = new Map<string, number>();
  const ids = new Map<string, number>();
  const failed = new Set<string>();
  const rows: SyncRow[] = [];
  for (const { line, record } of terms) {
    const key = slugKey(record.taxonomy, record.slug);
    if (!options.registry.termTaxonomies.has(record.taxonomy)) {
      fail(line, `unknown taxonomy "${record.taxonomy}"`);
      failed.add(key);
      continue;
    }
    const first = lines.get(key);
    if (first !== undefined) {
      fail(line, `duplicate term ${key}, first on line ${String(first)}`);
      continue;
    }
    lines.set(key, line);
    const checked = await options.checkMeta(
      { taxonomy: record.taxonomy },
      (record.meta ?? {}) as JsonObject,
    );
    if (checked.errors !== undefined) {
      for (const reason of checked.errors) fail(line, reason);
      failed.add(key);
      continue;
    }
    const id = rows.length + 1;
    ids.set(key, id);
    rows.push({
      id,
      taxonomy: record.taxonomy,
      name: record.name,
      slug: record.slug,
      description: record.description ?? null,
      meta: JSON.stringify(checked.meta),
    });
  }
  return { rows, ids, failed };
}

/** The ids of the terms an entry names, or `undefined` once any is refused. */
function linkedTermIds(
  line: number,
  record: EntryRecord,
  registry: PluginRegistry,
  termRows: TermRows,
  fail: Fail,
): number[] | undefined {
  const links: number[] = [];
  let refused = false;
  for (const ref of record.terms ?? []) {
    const key = slugKey(ref.taxonomy, ref.slug);
    const id = termRows.ids.get(key);
    if (!registry.termTaxonomies.has(ref.taxonomy)) {
      fail(line, `unknown taxonomy "${ref.taxonomy}"`);
      refused = true;
    } else if (id === undefined) {
      if (!termRows.failed.has(key)) fail(line, `unknown term ${key}`);
      refused = true;
    } else if (links.includes(id)) {
      fail(line, `term ${key} is listed twice`);
      refused = true;
    } else {
      links.push(id);
    }
  }
  return refused ? undefined : links;
}

function publishedAtOf(
  record: EntryRecord,
  status: string,
  now: Date,
): number | null {
  if (record.publishedAt !== undefined) {
    return seconds(new Date(record.publishedAt));
  }
  return status === "published" ? seconds(now) : null;
}

interface EntryRows {
  readonly entries: readonly SyncRow[];
  readonly entryTerms: readonly SyncRow[];
  readonly authorIds: ReadonlyMap<string, number>;
}

async function entryRowsOf(
  entries: readonly Located<EntryRecord>[],
  termRows: TermRows,
  options: ReadAuthoringOptions,
  fail: Fail,
): Promise<EntryRows> {
  const authorIds = new Map<string, number>();
  const lines = new Map<string, number>();
  const rows: SyncRow[] = [];
  const entryTerms: SyncRow[] = [];
  for (const { line, record } of entries) {
    if (!options.registry.entryTypes.has(record.entryType)) {
      fail(line, `unknown entry type "${record.entryType}"`);
      continue;
    }
    const key = slugKey(record.entryType, record.slug);
    const first = lines.get(key);
    if (first !== undefined) {
      fail(line, `duplicate entry ${key}, first on line ${String(first)}`);
      continue;
    }
    lines.set(key, line);
    const links = linkedTermIds(line, record, options.registry, termRows, fail);
    const checked = await options.checkMeta(
      { entryType: record.entryType },
      (record.meta ?? {}) as JsonObject,
    );
    if (checked.errors !== undefined) {
      for (const reason of checked.errors) fail(line, reason);
      continue;
    }
    if (links === undefined) continue;
    const authorId = authorIds.get(record.author) ?? authorIds.size + 1;
    authorIds.set(record.author, authorId);
    const id = rows.length + 1;
    const status = record.status ?? "published";
    rows.push({
      id,
      type: record.entryType,
      title: record.title,
      slug: record.slug,
      content:
        record.content === undefined || record.content === null
          ? null
          : JSON.stringify(record.content),
      excerpt: record.excerpt ?? null,
      status,
      author_id: authorId,
      meta: JSON.stringify(checked.meta),
      published_at: publishedAtOf(record, status, options.now),
    });
    links.forEach((termId, sortOrder) => {
      entryTerms.push({ entry_id: id, term_id: termId, sort_order: sortOrder });
    });
  }
  return { entries: rows, entryTerms, authorIds };
}

/**
 * Collects every failure before it throws `import_records_invalid`, so one run
 * names them all and nothing loads unless all pass. `file` is how errors name
 * `path`.
 */
export async function readAuthoringRecords(
  path: string,
  file: string,
  options: ReadAuthoringOptions,
): Promise<AuthoringRows> {
  const errors: string[] = [];
  const fail: Fail = (line, reason) => {
    errors.push(`${file}:${String(line)}: ${reason}`);
  };
  const parsed = await parseRecords(path, fail);
  const termRows = await termRowsOf(parsed.terms, options, fail);
  const { entries, entryTerms, authorIds } = await entryRowsOf(
    parsed.entries,
    termRows,
    options,
    fail,
  );
  if (errors.length > 0) throw PlumixCliError.importRecordsInvalid({ errors });
  const authors = [...authorIds].map(([email, id]): SyncRow => ({
    id,
    email,
    slug: options.slugify(email.split("@")[0] ?? "") || "author",
    name: null,
    avatar_url: null,
    role: "author",
  }));
  return { terms: termRows.rows, entries, entryTerms, authors };
}
