import type { EntryReadErrors } from "../../../rpc-errors.js";
import { EntryReadError } from "../../../entries/errors.js";

/**
 * `undefined` means the error is not an entries-read error; the caller
 * rethrows what it caught.
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
