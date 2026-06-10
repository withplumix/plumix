import { TermReadError } from "../../../terms/errors.js";

/**
 * The subset of oRPC typed-error constructors the terms read path maps onto.
 * Structural so the mapper is unit-testable with a plain stub — no oRPC runtime.
 */
export interface TermReadErrorConstructors {
  NOT_FOUND(opts: { data: { kind: string; id: number | string } }): Error;
  FORBIDDEN(opts: { data: { capability: string } }): Error;
}

/**
 * Translate a terms-read domain error into the oRPC typed error to throw.
 * Non-domain errors pass through unchanged for the caller to rethrow.
 */
export function toRpcTermReadError(
  error: unknown,
  errors: TermReadErrorConstructors,
): unknown {
  if (!(error instanceof TermReadError)) return error;
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
