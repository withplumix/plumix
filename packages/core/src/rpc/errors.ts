import * as v from "valibot";

export const RPC_ERRORS = {
  UNAUTHORIZED: {
    message: "Authentication required",
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
    }),
  },
} as const;
