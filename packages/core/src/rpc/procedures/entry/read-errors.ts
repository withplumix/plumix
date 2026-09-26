import type { EntryReadErrors } from "../../errors.js";
import { EntryReadError } from "../../../entries/errors.js";

/**
 * Translate an entries-read domain error into the oRPC typed error to throw,
 * preserving the wire contract the SPA already handles. `undefined` means this
 * error is not ours to translate — the caller rethrows what it caught.
 */
export function toRpcEntryReadError(
  error: unknown,
  errors: EntryReadErrors,
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
