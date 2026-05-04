import * as v from "valibot";

import type { AppContext } from "../../../context/app.js";
import type { RegisteredLookupAdapter } from "../../../plugin/lookup.js";

// `kind` matches the discriminator a reference field carries on its
// `referenceTarget.kind`. Valid kinds are checked against the
// adapter registry at handler time, so the schema only enforces a
// shape (lowercase alphanum + dash/underscore, ≤ 64 chars) the
// registry contract can store.
const kindSchema = v.pipe(v.string(), v.regex(/^[a-z][a-z0-9_-]{0,63}$/i));

const querySchema = v.pipe(v.string(), v.trim(), v.maxLength(200));

// Scope rides through to the adapter as an opaque JSON object.
// Per-kind validation lives in the adapter (e.g. `user` validates
// `roles` against `USER_ROLES`); the RPC schema only confirms the
// shape isn't an array or scalar.
const scopeSchema = v.optional(v.record(v.string(), v.unknown()));

// Realistic upper bound on a single id string. UUIDs are 36 chars;
// `Number.MAX_SAFE_INTEGER` is 16 digits. 64 covers both with room
// for plugin-supplied id formats (slug-like, prefixed) while
// preventing CPU amplification on the regex parsers each adapter
// runs against incoming ids.
const ID_MAX_LENGTH = 64;

// `ids` is the resolve-by-id batch path: when set, the adapter
// returns rows matching any of these ids (still scope-filtered) in
// a single query. Capped at 100 to match the meta pipeline's
// `HARD_MULTI_REFERENCE_LIMIT` — the picker can't ship a wider
// selection through to the validator anyway.
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

export const lookupResolveInputSchema = v.object({
  kind: kindSchema,
  id: v.pipe(v.string(), v.maxLength(ID_MAX_LENGTH)),
  scope: scopeSchema,
});

interface LookupErrors {
  NOT_FOUND: (args: { data: { kind: string; id: string } }) => Error;
  FORBIDDEN: (args: { data: { capability: string } }) => Error;
}

export function requireAdapter(
  context: AppContext,
  kind: string,
  errors: LookupErrors,
): RegisteredLookupAdapter {
  const registered = context.plugins.lookupAdapters.get(kind);
  if (!registered) {
    throw errors.NOT_FOUND({ data: { kind: "lookup_adapter", id: kind } });
  }
  // Picker-facing surface: the adapter's owner declared which
  // capability gates list/resolve. Without it, any authenticated
  // user could enumerate the adapter's universe (emails for `user`,
  // titles for future `entry`, etc.) at a lower privilege than the
  // matching list RPC enforces. Adapters that opt out (`null`) are
  // public — make that an explicit decision per kind.
  const { capability } = registered;
  if (capability !== null && !context.auth.can(capability)) {
    throw errors.FORBIDDEN({ data: { capability } });
  }
  return registered;
}
