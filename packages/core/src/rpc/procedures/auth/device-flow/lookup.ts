import { lookupDeviceCodeByUserCode } from "../../../../auth/device-flow.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { assertLookupOk } from "./lookup-helpers.js";
import { deviceFlowLookupInputSchema } from "./schemas.js";

/** Never exposes the device_code: it is the polling client's secret. */
export const lookup = base
  .use(authenticated)
  .input(deviceFlowLookupInputSchema)
  .handler(async ({ input, context, errors }) => {
    const result = await lookupDeviceCodeByUserCode(context.db, input.userCode);
    assertLookupOk(result, input.userCode, errors);
    return { ok: true as const };
  });
