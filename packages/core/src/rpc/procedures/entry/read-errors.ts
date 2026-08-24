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
 * preserving the wire contract the SPA already handles. `undefined` means this
 * error is not ours to translate — the caller rethrows what it caught.
 */
export function toRpcEntryReadError(
  error: unknown,
  errors: EntryReadErrorConstructors,
): Error | undefined {
  if (!(error instanceof EntryReadError)) return undefined;
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
