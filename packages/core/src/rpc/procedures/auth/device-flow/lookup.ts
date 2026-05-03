import { lookupDeviceCodeByUserCode } from "../../../../auth/device-flow.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { assertLookupOk } from "./lookup-helpers.js";
import { deviceFlowLookupInputSchema } from "./schemas.js";

// Authenticated lookup of a user_code typed into the admin's
// `/auth/device` page. Returns `{ ok: true }` when the code is a
// pending device-flow row that this user can approve; surfaces
// distinct CONFLICT reasons for expired / already-approved /
// already-denied codes so the UI can render specific copy.
//
// We don't expose the device_code (it's the polling client's secret)
// or any user-targeted information — the user_code alone is enough
// for the admin UI to render the "Approve this CLI?" prompt.
export const lookup = base
  .use(authenticated)
  .input(deviceFlowLookupInputSchema)
  .handler(async ({ input, context, errors }) => {
    const result = await lookupDeviceCodeByUserCode(context.db, input.userCode);
    assertLookupOk(result, input.userCode, errors);
    return { ok: true as const };
  });
