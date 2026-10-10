import type { LookupUserCodeResult } from "../../../../auth/device-flow.js";
import type { DeviceCodeLookupErrors } from "../../../../rpc-errors.js";

/**
 * Shared by lookup, approve and deny so they report identical error reasons.
 */
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
