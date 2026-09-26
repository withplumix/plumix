import type { GatedLookupErrors } from "../../errors.js";
import { TermReadError } from "../../../terms/errors.js";

/**
 * Translate a terms-read domain error into the oRPC typed error to throw.
 * `undefined` means this error is not ours to translate — the caller rethrows
 * what it caught.
 */
export function toRpcTermReadError(
  error: unknown,
  errors: GatedLookupErrors,
): Error | undefined {
  if (!(error instanceof TermReadError)) return undefined;
  switch (error.data.code) {
    case "taxonomy_not_found":
      return errors.NOT_FOUND({
        data: { kind: "taxonomy", id: error.data.taxonomy },
      });
    case "term_not_found":
      return errors.NOT_FOUND({
        data: { kind: "term", id: error.data.termId },
      });
    case "forbidden":
      return errors.FORBIDDEN({
        data: { capability: error.data.capability },
      });
  }
}
