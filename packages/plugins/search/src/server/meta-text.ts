import type { MetaBoxField, PluginRegistry } from "plumix/plugin";
import { listEntryMetaFields } from "plumix/plugin";

// Bumped when the extraction below changes — a different way of walking a
// nested document, a different separator. The roster hashes itself, but
// nothing else would tell text derived by an older extractor from current.
const META_EXTRACTOR_ALGORITHM = "1";

/**
 * How a searchable field's stored value has to be read to get text out of it.
 * `string` is the value itself; `richtext` is the nested document the field
 * stores, which carries its prose in leaves rather than in one string.
 */
export type SearchableMetaKind = "string" | "richtext";

export interface SearchableMetaField {
  readonly key: string;
  readonly kind: SearchableMetaKind;
}

/** `entry type → the meta fields its documents are built from`. */
export type SearchableMetaRoster = ReadonlyMap<
  string,
  readonly SearchableMetaField[]
>;

// The inputs whose stored value is prose a visitor could reasonably search
// for, and the only ones a `.searchable()` chain is offered on. Named rather
// than derived from the string family: `password` is a string input too, and
// a sixth one joining that family should not become public index content by
// arriving.
const TEXT_INPUT_KINDS = new Map<string, SearchableMetaKind>([
  ["text", "string"],
  ["textarea", "string"],
  ["email", "string"],
  ["url", "string"],
  ["richtext", "richtext"],
]);

/**
 * How a field's value is read as text, or nothing when it is not indexed.
 *
 * Two exclusions sit here beside the opt-in, and they are the same rule
 * rather than two: a document's body is served back to an anonymous visitor
 * as a snippet around a word that visitor chose, so a value not everyone may
 * read cannot be in it. A capability-gated field is the declared case; a
 * password field is the one an author is likely to reach for without
 * thinking, and the admin already masks it for the same reason. Excluding
 * both from the projection is what makes the leak impossible rather than
 * dependent on a predicate the query surface remembers.
 *
 * A field's capability is the one core enforces server-side; the capability a
 * *box* carries is a UI filter that any holder of the entity's write gate can
 * go around, so it says nothing about who may read a value and is not
 * consulted here either.
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
 * The same across the types that are actually indexed — what the version
 * hashes.
 *
 * The caller supplies the types rather than this reading the registry itself,
 * which keeps the searchability rule in `document.ts` where the rest of it
 * lives instead of importing it back the way it came. Types that reach no
 * document are left out on purpose: a field declared on one cannot move any
 * text, so folding it into the tag would restamp the whole corpus — a read of
 * every entry row and a walk of every block tree — for nothing.
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

// Matches the cap core's richtext validator enforces on write, and is here
// for the same arithmetic: a node costs roughly 30 bytes, so the 256 KiB
// per-value meta cap still buys thousands of levels — enough to exhaust the
// stack. The write path already refuses a document this deep, but the change
// feed carries bags that never went through it (a seed, an import, a direct
// write), and a `RangeError` here throws inside the drain.
const MAX_DOCUMENT_DEPTH = 100;

/**
 * The prose a nested document holds, its structure flattened.
 *
 * Adjacent text nodes are glued rather than joined: an editor marking half a
 * word bold stores it as two nodes, and separating them would file "unbroken"
 * under two tokens neither of which the reader typed. Anything else — a
 * paragraph, a line break, a node the walk cannot read — separates, so two
 * lines never fuse into one word instead.
 *
 * Past the depth cap the subtree reads as unreadable rather than throwing,
 * which is what every other shape this walk cannot parse does.
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

/** One field's stored value read as the text its kind carries. */
function fieldText(raw: unknown, kind: SearchableMetaKind): string {
  if (kind === "richtext") return documentText(raw);
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * The text these fields carry out of one entry's meta bag, newline-joined so
 * two fields stay two tokens.
 *
 * A key the bag does not hold, and a key holding something other than what
 * its field declared, both contribute nothing rather than throwing: meta is
 * written through the field pipeline but the column predates any given
 * roster, so a stale bag is a thing that exists.
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
 * A tag for the extraction this roster produces, so a document derived from
 * an older one can be told apart from a current one — which is what makes
 * marking a field searchable re-index the entries it affects with nobody
 * bumping a number by hand.
 *
 * Sorted before hashing, so the tag tracks the declared *set* rather than the
 * order plugins registered their boxes in.
 *
 * Two-lane FNV-1a to 64 bits, the same shape `blockTextVersion` uses on the
 * block roster: cheap, synchronous and dependency-free. Only change detection
 * is needed — but a collision means affected rows never re-index, so 32 bits
 * is thinner than it needs to be.
 *
 * Deliberately a copy rather than a shared helper. The two tags are halves of
 * a composite and never compared with each other, so one changing how it
 * hashes moves that half and restamps — which is the behaviour wanted, not a
 * divergence to guard against.
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
