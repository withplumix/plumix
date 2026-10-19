import { ORPCError } from "@orpc/client";
import * as v from "valibot";

import type { LeaseHolder } from "../db/edit-lease.js";

/**
 * A save refused because another write landed since the editor's copy: the
 * resource's `etag` now, when it changed (a `version` token doesn't record
 * it) and who holds its edit lease.
 */
export interface EtagConflict {
  readonly etag: string;
  readonly updatedAt?: Date;
  readonly holder?: LeaseHolder;
}

const staleCopy = v.object({
  reason: v.literal("etag_mismatch"),
  etag: v.string(),
  updatedAt: v.optional(v.date()),
  holder: v.optional(v.object({ id: v.number(), name: v.string() })),
});

/** The conflict a stale-copy `CONFLICT` carries; `undefined` for any other error. */
export function etagConflict(err: unknown): EtagConflict | undefined {
  if (!(err instanceof ORPCError) || err.code !== "CONFLICT") return undefined;
  const parsed = v.safeParse(staleCopy, err.data);
  if (!parsed.success) return undefined;
  const { etag, updatedAt, holder } = parsed.output;
  return {
    etag,
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(holder === undefined ? {} : { holder }),
  };
}
