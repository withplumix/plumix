import type { ORPCErrorConstructorMap } from "@orpc/server";
import * as v from "valibot";

export const RPC_ERRORS = {
  UNAUTHORIZED: {
    message: "Authentication required",
  },
  BAD_REQUEST: {
    message: "Invalid input",
    data: v.object({
      reason: v.string(),
    }),
  },
  FORBIDDEN: {
    message: "Permission denied",
    data: v.object({
      capability: v.string(),
    }),
  },
  NOT_FOUND: {
    message: "Resource not found",
    data: v.object({
      kind: v.string(),
      id: v.union([v.string(), v.number()]),
    }),
  },
  CONFLICT: {
    message: "Resource conflict",
    data: v.object({
      reason: v.string(),
      // Optional identifier the client can surface in-context. Filled by
      // reasons that pinpoint a specific field/row (e.g. `meta_*` reasons
      // set this to the offending meta key); omitted otherwise.
      key: v.optional(v.string()),
      // Path-addressed field rejections from the meta constraint walker.
      // `path` dot-joins from the top-level meta key into nested repeater
      // cells (`sections.2.heading`); `message` is either a plain string
      // (custom `.validate()` verdicts) or an i18n message descriptor the
      // admin resolves against its catalog. `looseObject` keeps the
      // descriptor's `values` interpolations on the wire.
      errors: v.optional(
        v.array(
          v.object({
            path: v.string(),
            message: v.union([
              v.string(),
              v.looseObject({
                id: v.string(),
                message: v.optional(v.string()),
              }),
            ]),
          }),
        ),
      ),
    }),
  },
  PAYLOAD_TOO_LARGE: {
    message: "Payload too large",
    data: v.object({
      limit: v.number(),
      received: v.optional(v.number()),
    }),
  },
  UNSUPPORTED_MEDIA_TYPE: {
    message: "Unsupported media type",
    data: v.object({
      mime: v.string(),
    }),
  },
  INVALID_BLOCK_CONTENT: {
    message: "Block content failed registry validation",
    data: v.object({
      issues: v.array(
        v.object({
          code: v.string(),
          message: v.string(),
          path: v.string(),
          nodeName: v.optional(v.string()),
          attributeName: v.optional(v.string()),
          markName: v.optional(v.string()),
        }),
      ),
    }),
  },
} as const;

export type RpcErrors = ORPCErrorConstructorMap<typeof RPC_ERRORS>;

// The subsets shared helpers take from a handler's `errors`. Picked rather
// than restated, so a payload change here fails to compile at every helper
// that throws the old one.

/** A capability gate's denial — the edit gate and per-field meta gates. */
export type CapabilityErrors = Pick<RpcErrors, "FORBIDDEN">;

/** Load a row by id, then gate it on a capability. */
export type GatedLookupErrors = Pick<RpcErrors, "NOT_FOUND" | "FORBIDDEN">;

/** Mapping an entries-read domain error onto the wire. */
export type EntryReadErrors = Pick<
  RpcErrors,
  "NOT_FOUND" | "FORBIDDEN" | "BAD_REQUEST"
>;

/** An entry's `terms` patch: unknown taxonomy, unassignable, mismatched. */
export type TermsPatchErrors = Pick<
  RpcErrors,
  "NOT_FOUND" | "FORBIDDEN" | "CONFLICT"
>;

/** A device-flow user code that is missing or already settled. */
export type DeviceCodeLookupErrors = Pick<RpcErrors, "NOT_FOUND" | "CONFLICT">;

/** An input the procedure rejects outright. */
export type BadRequestErrors = Pick<RpcErrors, "BAD_REQUEST">;

/** A write that conflicts with a stored constraint — meta, settings, size caps. */
export type ConflictErrors = Pick<RpcErrors, "CONFLICT">;

/** Entry content the block registries reject. */
export type BlockContentErrors = Pick<RpcErrors, "INVALID_BLOCK_CONTENT">;
