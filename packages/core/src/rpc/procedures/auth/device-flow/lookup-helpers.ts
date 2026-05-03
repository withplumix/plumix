import type { LookupUserCodeResult } from "../../../../auth/device-flow.js";

// Map a `lookupDeviceCodeByUserCode` outcome to the right RPC error
// and narrow the result type for callers that only want the `ok`
// branch. The three device-flow procedures (lookup / approve / deny)
// share this — extracted to keep each procedure's body small and to
// guarantee consistent error reasons across them (a future
// `already_*` outcome is added once and propagates everywhere).
//
// `errors` is the oRPC errors map shape from procedure handlers; we
// type it loosely as `RpcErrors` so we don't have to import the
// generated procedure types here.
interface RpcErrors {
  NOT_FOUND(input: { data: { kind: string; id: string } }): Error;
  CONFLICT(input: { data: { reason: string } }): Error;
}

export function assertLookupOk(
  result: LookupUserCodeResult,
  userCode: string,
  errors: RpcErrors,
): { id: string } {
  switch (result.outcome) {
    case "ok":
      return { id: result.id };
    case "not_found":
      throw errors.NOT_FOUND({
        data: { kind: "device_code", id: userCode },
      });
    case "expired":
      throw errors.CONFLICT({ data: { reason: "expired" } });
    case "already_approved":
      throw errors.CONFLICT({ data: { reason: "already_approved" } });
    case "already_denied":
      throw errors.CONFLICT({ data: { reason: "already_denied" } });
  }
}
