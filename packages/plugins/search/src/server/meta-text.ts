import type { MetaBoxField } from "plumix/fields";
import type { PluginRegistry } from "plumix/plugin";
import { listEntryMetaFields } from "plumix/plugin";

/** Bump when the extraction below changes; the roster hash cannot see that. */
const META_EXTRACTOR_ALGORITHM = "1";

export interface SearchableMetaField {
  readonly key: string;
  readonly kind: "string" | "richtext";
}

type SearchableMetaKind = SearchableMetaField["kind"];

/** `entry type → the meta fields its documents are built from`. */
export type SearchableMetaRoster = ReadonlyMap<
  string,
  readonly SearchableMetaField[]
>;

/**
 * Named rather than derived from the string family: `password` is one too,
 * and a new string input must not become public index content by arriving.
 */
const TEXT_INPUT_KINDS = new Map<string, SearchableMetaKind>([
  ["text", "string"],
  ["textarea", "string"],
  ["email", "string"],
  ["url", "string"],
  ["richtext", "richtext"],
]);

/**
 * Snippets reach anonymous visitors, so capability-gated fields stay out. A
 * box's capability is only a UI filter and is deliberately not consulted.
 */
function searchableKind(field: MetaBoxField): SearchableMetaKind | undefined {
  if (field.searchable !== true) return undefined;
  if (field.capability !== undefined) return undefined;
  return TEXT_INPUT_KINDS.get(field.inputType);
}

/** The meta fields an entry of this type contributes to its document. */
export function searchableMetaFields(
  plugins: PluginRegistry,
  entryType: string,
): readonly SearchableMetaField[] {
  const fields: SearchableMetaField[] = [];
  for (const field of listEntryMetaFields(plugins, entryType)) {
    const kind = searchableKind(field);
    if (kind !== undefined) fields.push({ key: field.key, kind });
  }
  return fields;
}

/**
 * Pass only indexed types: a field on any other type would restamp the whole
 * corpus for nothing.
 */
export function searchableMetaRoster(
  plugins: PluginRegistry,
  entryTypes: Iterable<string>,
): SearchableMetaRoster {
  const roster = new Map<string, readonly SearchableMetaField[]>();
  for (const type of entryTypes) {
    const fields = searchableMetaFields(plugins, type);
    if (fields.length > 0) roster.set(type, fields);
  }
  return roster;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isTextNode = (node: unknown): node is { readonly text: string } =>
  isRecord(node) && typeof node.text === "string";

/**
 * Matches core's richtext write cap. The change feed also carries bags that
 * skipped validation, and a stack overflow here would throw inside the drain.
 */
const MAX_DOCUMENT_DEPTH = 100;

/**
 * Adjacent text nodes are glued: half a word in bold is two nodes, and
 * splitting them would index two tokens nobody typed.
 */
function documentText(node: unknown, depth = 0): string {
  if (isTextNode(node)) return node.text;
  if (depth > MAX_DOCUMENT_DEPTH || !isRecord(node)) return "";
  const content: unknown = node.content;
  if (!Array.isArray(content)) return "";
  let out = "";
  let previous: unknown;
  for (const child of content) {
    const text = documentText(child, depth + 1);
    const glued = isTextNode(previous) && isTextNode(child);
    previous = child;
    if (text === "") continue;
    if (out !== "") out += glued ? "" : "\n";
    out += text;
  }
  return out;
}

function fieldText(raw: unknown, kind: SearchableMetaKind): string {
  if (kind === "richtext") return documentText(raw);
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * A missing key, or one holding the wrong shape, contributes nothing rather
 * than throwing.
 */
export function extractMetaText(
  meta: unknown,
  fields: readonly SearchableMetaField[],
): string {
  if (!isRecord(meta)) return "";
  const parts: string[] = [];
  for (const field of fields) {
    const raw: unknown = meta[field.key];
    const text = fieldText(raw, field.kind);
    if (text !== "") parts.push(text);
  }
  return parts.join("\n");
}

/**
 * Independent of registration order. Two-lane 64-bit FNV-1a, since a collision
 * means affected rows never re-index. Deliberately a copy of
 * `blockTextVersion`'s hash.
 */
export function metaTextVersion(roster: SearchableMetaRoster): string {
  const declarations = [...roster]
    .map(([type, fields]): readonly [string, readonly string[]] => [
      type,
      fields.map((field) => `${field.key}:${field.kind}`).sort(),
    ])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const canonical = JSON.stringify([META_EXTRACTOR_ALGORITHM, declarations]);
  let low = 0x811c9dc5;
  let high = 0x01000193;
  for (let i = 0; i < canonical.length; i += 1) {
    const code = canonical.charCodeAt(i);
    low = Math.imul(low ^ code, 0x01000193);
    high = Math.imul(high ^ code, 0x85ebca6b);
  }
  return (
    (low >>> 0).toString(16).padStart(8, "0") +
    (high >>> 0).toString(16).padStart(8, "0")
  );
}
