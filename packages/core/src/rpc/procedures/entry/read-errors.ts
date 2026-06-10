import { EntryReadError } from "../../../entries/errors.js";

/**
 * The subset of oRPC typed-error constructors the entries read path maps onto.
 * Structural so the mapper is unit-testable with a plain stub — no oRPC runtime.
 */
export interface EntryReadErrorConstructors {
  NOT_FOUND(opts: { data: { kind: string; id: number | string } }): Error;
  FORBIDDEN(opts: { data: { capability: string } }): Error;
  BAD_REQUEST(opts: { data: { reason: string } }): Error;
}

/**
 * Translate an entries-read domain error into the oRPC typed error to throw,
 * preserving the wire contract the SPA already handles. Non-domain errors pass
 * through unchanged for the caller to rethrow.
 */
export function toRpcEntryReadError(
  error: unknown,
  errors: EntryReadErrorConstructors,
): unknown {
  if (!(error instanceof EntryReadError)) return error;
  switch (error.data.code) {
    case "not_found":
      return errors.NOT_FOUND({
        data: { kind: "entry", id: error.data.entryId },
      });
    case "forbidden":
      return errors.FORBIDDEN({
        data: { capability: error.data.capability },
      });
    case "reserved_type":
      return errors.BAD_REQUEST({ data: { reason: "reserved_type" } });
  }
}
