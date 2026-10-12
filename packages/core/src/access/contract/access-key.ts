import type { JsonObject } from "../../json.js";
import type { ResolvedMeta } from "../../meta/contract/bags.js";
import { ACCESS_POLICY_META_KEY } from "./meta-key.js";

/** The parts of an entry its access policy is chosen by. */
export interface EntryAccessSubject {
  readonly type: string;
  /**
   * Either form works: the access key is a plain string that survives decoding.
   */
  readonly meta?: JsonObject | ResolvedMeta | null;
}

/**
 * The per-entry access choice stored under the reserved meta key, or
 * `undefined` when unset (or stored as a non-string by some out-of-band write).
 */
export function readAccessKey(
  meta: EntryAccessSubject["meta"],
): string | undefined {
  const value = meta?.[ACCESS_POLICY_META_KEY];
  return typeof value === "string" ? value : undefined;
}
