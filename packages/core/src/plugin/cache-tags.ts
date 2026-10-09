import type { CacheRead, CacheWrite } from "../cdn/contract/subjects.js";
import type { PluginRegistry } from "./registry.js";
import { normalizeTag } from "../cdn/contract/tags.js";
import { publicEntryTypeNames, termPageEntryTypeNames } from "./registry.js";

// The one rule that spells cache tags (ADR 0042). A read names what it read, a
// write names what it changed, and this module spells both. A write's tags are
// the tags of every read it changes, so a reader and the writer that should
// purge it cannot work their tags out differently.
//
// Beside the registry because the rule reads its type sets, and below the CDN
// because the request memo and the plugin contracts speak it too.

function readTag(plugins: PluginRegistry, read: CacheRead): string[] {
  switch (read.kind) {
    case "entry":
      return [`e:${String(read.id)}`];
    case "entryType":
      return [`t:${read.type}`];
    case "taxonomy":
      // A term archive lists the entry types its taxonomy names, or every
      // public type when it names none.
      return termPageEntryTypeNames(plugins, read.taxonomy).map(
        (type) => `t:${type}`,
      );
    case "term":
      return [`tm:${String(read.id)}`];
    case "user":
      return [`u:${String(read.id)}`];
    case "settings":
      return [`s:${read.group}`];
    case "own":
      return [
        read.id === undefined
          ? read.namespace
          : `${read.namespace}:${String(read.id)}`,
      ];
  }
}

// What each write changes, as the reads that saw it.
function readsChangedBy(
  plugins: PluginRegistry,
  write: CacheWrite,
): CacheRead[] {
  switch (write.kind) {
    case "entry":
      return [
        { kind: "entryType", type: write.type },
        { kind: "entry", id: write.id },
      ];
    case "term":
      return [
        { kind: "taxonomy", taxonomy: write.taxonomy },
        { kind: "term", id: write.id },
      ];
    case "user":
      // Every public page prints its author, and a delete reassigns entries
      // without an entry write, so a user write reaches every public type.
      return [
        ...publicEntryTypeNames(plugins).map((type): CacheRead => ({
          kind: "entryType",
          type,
        })),
        { kind: "user", id: write.id },
      ];
    case "settings":
    case "own":
      return [write];
  }
}

/** The de-duplicated cache tags `reads` are stored under. */
export function readTags(
  plugins: PluginRegistry,
  reads: readonly CacheRead[],
): string[] {
  const tags = new Set<string>();
  for (const read of reads) {
    for (const tag of readTag(plugins, read)) tags.add(normalizeTag(tag));
  }
  return [...tags];
}

/** The de-duplicated cache tags `writes` purge. */
export function writeTags(
  plugins: PluginRegistry,
  writes: readonly CacheWrite[],
): string[] {
  return readTags(
    plugins,
    writes.flatMap((write) => readsChangedBy(plugins, write)),
  );
}
