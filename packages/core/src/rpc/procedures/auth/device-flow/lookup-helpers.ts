import type { LookupUserCodeResult } from "../../../../auth/device-flow.js";
import type { DeviceCodeLookupErrors } from "../../../errors.js";

// Map a `lookupDeviceCodeByUserCode` outcome to the right RPC error
// and narrow the result type for callers that only want the `ok`
// branch. The three device-flow procedures (lookup / approve / deny)
// share this — extracted to keep each procedure's body small and to
// guarantee consistent error reasons across them (a future
// `already_*` outcome is added once and propagates everywhere).

export function assertLookupOk(
  result: LookupUserCodeResult,
  userCode: string,
  errors: DeviceCodeLookupErrors,
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
