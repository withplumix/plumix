import type { ORPCErrorConstructorMap } from "@orpc/server";
import * as v from "valibot";

// Typed errors for the REST surface. Forbidden reads collapse to NOT_FOUND
// upstream (in the entry/term services) to preserve hide-existence, so the
// public read surface only ever needs NOT_FOUND today.
export const REST_ERRORS = {
  NOT_FOUND: {
    message: "Resource not found",
    data: v.object({ kind: v.string() }),
  },
} as const;

export type RestErrors = ORPCErrorConstructorMap<typeof REST_ERRORS>;
