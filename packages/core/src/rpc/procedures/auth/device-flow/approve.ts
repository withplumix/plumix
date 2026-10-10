import {
  approveDeviceCode,
  lookupDeviceCodeByUserCode,
} from "../../../../auth/device-flow.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { assertLookupOk } from "./lookup-helpers.js";
import { deviceFlowApproveInputSchema } from "./schemas.js";

/**
 * Looks up first to report a specific failure reason. A code that flips
 * between lookup and update makes `approveDeviceCode` return false, which
 * isn't told apart.
 */
export const approve = base
  .use(authenticated)
  .input(deviceFlowApproveInputSchema)
  .handler(async ({ input, context, errors }) => {
    const found = await lookupDeviceCodeByUserCode(context.db, input.userCode);
    const ok = assertLookupOk(found, input.userCode, errors);

    await approveDeviceCode(context.db, {
      id: ok.id,
      userId: context.user.id,
      tokenName: input.tokenName,
      scopes: input.scopes,
    });
    await context.hooks.doAction(
      "device_code:approved",
      {
        id: ok.id,
        userCode: input.userCode,
        tokenName: input.tokenName,
        scopes: input.scopes ?? null,
      },
      { actor: context.user },
      context,
    );
    return { ok: true as const };
  });
