import {
  denyDeviceCode,
  lookupDeviceCodeByUserCode,
} from "../../../../auth/device-flow.js";
import { auth } from "../../../../hooks/auth.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { assertLookupOk } from "./lookup-helpers.js";
import { deviceFlowDenyInputSchema } from "./schemas.js";

/**
 * Surfacing `access_denied` leaks that the user rejected the prompt; we take
 * that for faster CLI feedback. Operators can omit the Deny button and let
 * the row expire.
 */
export const deny = base
  .use(authenticated)
  .input(deviceFlowDenyInputSchema)
  .handler(async ({ input, context, errors }) => {
    const found = await lookupDeviceCodeByUserCode(context.db, input.userCode);
    const ok = assertLookupOk(found, input.userCode, errors);

    await denyDeviceCode(context.db, { id: ok.id });
    await context.events.emit(auth.deviceCodeDenied, {
      deviceCode: { id: ok.id, userCode: input.userCode },
      actor: context.user,
    });
    return { ok: true as const };
  });
