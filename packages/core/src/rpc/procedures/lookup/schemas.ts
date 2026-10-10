import * as v from "valibot";

import type { AppContext } from "../../../context/app-context.js";
import type { RegisteredLookupAdapter } from "../../../plugin/lookup.js";
import type { GatedLookupErrors } from "../../../rpc-errors.js";
import { resolveCapability } from "../../../access/contract/capability.js";

/** Valid kinds are checked against the adapter registry at handler time. */
const kindSchema = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_-]{0,63}$/i));

const querySchema = v.pipe(v.string(), v.trim(), v.maxLength(200));

/** Per-kind validation lives in the adapter; here only the object shape. */
const scopeSchema = v.optional(v.record(v.string(), v.unknown()));

/**
 * Fits UUIDs and safe integers with room for plugin formats, while bounding
 * the regex work each adapter runs on incoming ids.
 */
const ID_MAX_LENGTH = 64;

/**
 * Capped at 100 to match `HARD_MULTI_REFERENCE_LIMIT`; the validator rejects
 * a wider selection anyway.
 */
const lookupListIdsSchema = v.pipe(
  v.array(v.pipe(v.string(), v.maxLength(ID_MAX_LENGTH))),
  v.maxLength(100),
);

export const lookupListInputSchema = v.object({
  kind: kindSchema,
  query: v.optional(querySchema),
  scope: scopeSchema,
  limit: v.optional(
    v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100)),
  ),
  ids: v.optional(lookupListIdsSchema),
});

export function requireAdapter(
  context: AppContext,
  kind: string,
  errors: GatedLookupErrors,
): RegisteredLookupAdapter {
  const registered = context.plugins.lookupAdapters.get(kind);
  if (!registered) {
    throw errors.NOT_FOUND({ data: { kind: "lookup_adapter", id: kind } });
  }
  // Without the declared capability any authenticated user could enumerate
  // the adapter's universe below the matching list RPC's privilege. `null`
  // is an explicit per-kind opt-out.
  const { capability } = registered;
  if (capability !== null && !context.auth.can(capability)) {
    throw errors.FORBIDDEN({
      data: { capability: resolveCapability(context.plugins, capability) },
    });
  }
  return registered;
}
