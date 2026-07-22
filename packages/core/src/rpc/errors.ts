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
