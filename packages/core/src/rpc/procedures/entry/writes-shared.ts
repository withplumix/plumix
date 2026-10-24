import { createORPCErrorConstructorMap } from "@orpc/server";

import type { Entry } from "../../../db/schema/entries.js";
import type { JsonObject } from "../../../json.js";
import type { ResolvedMeta } from "../../../meta/contract/bags.js";
import type { MetaPatch } from "../../../meta/core.js";
import type { EntryCreateInput, EntryUpdateInput } from "./schemas.js";
import { RPC_ERRORS } from "../../../rpc-errors.js";

/** The constructors a handler's `errors` holds, for a write made outside one. */
export const writeErrors = createORPCErrorConstructorMap(RPC_ERRORS);

/**
 * `storedMeta` keys are written into the stored bag as given, past the field
 * pipeline: a plugin's own record of the entry, which no meta-box field owns.
 */
interface StoredMetaInput {
  readonly storedMeta?: JsonObject;
}

export type EntryCreate = EntryCreateInput & StoredMetaInput;
export type EntryUpdate = EntryUpdateInput & StoredMetaInput;

export interface EntryWritten {
  readonly entry: Entry;
  readonly meta: ResolvedMeta;
  readonly etag: string;
}

/**
 * Entry writes as the context's principal, down the path core's own entry
 * procedures take. Checks no capability: the caller gates the write first.
 */
export interface EntryWrites {
  create(input: EntryCreate): Promise<EntryWritten>;
  /** `ifMatch` and the edit lease are enforced as on `entry.update`. */
  update(input: EntryUpdate): Promise<EntryWritten>;
  /** Deletes the entry outright, whatever its status. */
  delete(id: number): Promise<Entry>;
}

declare module "../../../context/app-context.js" {
  interface AppContextExtensions {
    readonly entries: EntryWrites;
  }
}

export function withStoredMeta(
  patch: MetaPatch | null,
  storedMeta: JsonObject | undefined,
): MetaPatch | null {
  if (storedMeta === undefined) return patch;
  const upserts = new Map(patch?.upserts);
  for (const [key, value] of Object.entries(storedMeta)) {
    upserts.set(key, value);
  }
  return { upserts, deletes: patch?.deletes ?? [] };
}
