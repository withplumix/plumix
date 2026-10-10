// Re-typed to keep plumix internals out. Matches core's `MetaChanges`, where
// `set` is the stored bag, not the hydrated one.

import type { JsonObject } from "plumix";

export interface EntryMetaChanges {
  readonly set: JsonObject;
  readonly removed: readonly string[];
}
