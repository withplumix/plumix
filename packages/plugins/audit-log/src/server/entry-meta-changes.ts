// Re-typing the shape we observe on `entry:meta_changed` so the hooks
// file can stay free of plumix internals. Matches `MetaChanges` in
// core's meta/core.ts — including `set` being the normalized, stored bag
// rather than the hydrated read one.

import type { JsonObject } from "plumix";

export interface EntryMetaChanges {
  readonly set: JsonObject;
  readonly removed: readonly string[];
}
