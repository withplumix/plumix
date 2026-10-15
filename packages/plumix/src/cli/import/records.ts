import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import * as v from "valibot";

import type { JsonObject, PluginRegistry, SyncRow } from "@plumix/core";

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

/** What a meta bag is checked with; `plumix import` passes core's. */
type CheckMeta = (
  owner: { readonly entryType: string } | { readonly taxonomy: string },
  meta: JsonObject,
) => Promise<
  | { readonly meta: JsonObject; readonly errors?: undefined }
  | { readonly meta?: undefined; readonly errors: readonly string[] }
>;

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

function seconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

function termKey(taxonomy: string, slug: string): string {
  return `${taxonomy}/${slug}`;
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
  const { registry } = options;
  const errors: string[] = [];
  const fail = (line: number, reason: string): void => {
    errors.push(`${file}:${String(line)}: ${reason}`);
  };
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

  const termIds = new Map<string, { id: number; line: number }>();
  const termRows: SyncRow[] = [];
  for (const { line, record } of terms) {
    if (!registry.termTaxonomies.has(record.taxonomy)) {
      fail(line, `unknown taxonomy "${record.taxonomy}"`);
      continue;
    }
    const key = termKey(record.taxonomy, record.slug);
    const first = termIds.get(key);
    if (first !== undefined) {
      fail(line, `duplicate term ${key}, first on line ${String(first.line)}`);
      continue;
    }
    const checked = await options.checkMeta(
      { taxonomy: record.taxonomy },
      (record.meta ?? {}) as JsonObject,
    );
    if (checked.errors !== undefined) {
      for (const reason of checked.errors) fail(line, reason);
      continue;
    }
    const id = termRows.length + 1;
    termIds.set(key, { id, line });
    termRows.push({
      id,
      taxonomy: record.taxonomy,
      name: record.name,
      slug: record.slug,
      description: record.description ?? null,
      meta: JSON.stringify(checked.meta),
    });
  }

  const authorIds = new Map<string, number>();
  const entryLines = new Map<string, number>();
  const entryRows: SyncRow[] = [];
  const entryTerms: SyncRow[] = [];
  for (const { line, record } of entries) {
    if (!registry.entryTypes.has(record.entryType)) {
      fail(line, `unknown entry type "${record.entryType}"`);
      continue;
    }
    const key = termKey(record.entryType, record.slug);
    const first = entryLines.get(key);
    if (first !== undefined) {
      fail(line, `duplicate entry ${key}, first on line ${String(first)}`);
      continue;
    }
    entryLines.set(key, line);
    const links: number[] = [];
    let linked = true;
    for (const ref of record.terms ?? []) {
      const refKey = termKey(ref.taxonomy, ref.slug);
      const term = termIds.get(refKey);
      if (!registry.termTaxonomies.has(ref.taxonomy)) {
        fail(line, `unknown taxonomy "${ref.taxonomy}"`);
        linked = false;
      } else if (term === undefined) {
        fail(line, `unknown term ${refKey}`);
        linked = false;
      } else if (links.includes(term.id)) {
        fail(line, `term ${refKey} is listed twice`);
        linked = false;
      } else {
        links.push(term.id);
      }
    }
    const checked = await options.checkMeta(
      { entryType: record.entryType },
      (record.meta ?? {}) as JsonObject,
    );
    if (checked.errors !== undefined) {
      for (const reason of checked.errors) fail(line, reason);
      continue;
    }
    if (!linked) continue;
    const authorId = authorIds.get(record.author) ?? authorIds.size + 1;
    authorIds.set(record.author, authorId);
    const id = entryRows.length + 1;
    const status = record.status ?? "published";
    const publishedAt =
      record.publishedAt !== undefined
        ? seconds(new Date(record.publishedAt))
        : status === "published"
          ? seconds(options.now)
          : null;
    entryRows.push({
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
      published_at: publishedAt,
    });
    links.forEach((termId, sortOrder) => {
      entryTerms.push({ entry_id: id, term_id: termId, sort_order: sortOrder });
    });
  }

  if (errors.length > 0) throw PlumixCliError.importRecordsInvalid({ errors });
  const authors = [...authorIds].map(([email, id]): SyncRow => ({
    id,
    email,
    slug: options.slugify(email.split("@")[0] ?? "") || "author",
    name: null,
    avatar_url: null,
    role: "author",
  }));
  return { terms: termRows, entries: entryRows, entryTerms, authors };
}
