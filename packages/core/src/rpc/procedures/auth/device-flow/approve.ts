import {
  approveDeviceCode,
  lookupDeviceCodeByUserCode,
} from "../../../../auth/device-flow.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { assertLookupOk } from "./lookup-helpers.js";
import { deviceFlowApproveInputSchema } from "./schemas.js";

// Approve a pending device-flow session. The browser-side authed user
// confirms "yes, this is my CLI", optionally narrows scopes + names
// the token that will be minted, and the server flips the row's
// status to `approved` + binds `userId`. The polling client's next
// call to the public token endpoint then atomically consumes the row
// and returns the API token.
//
// Looks up first to surface specific error reasons (expired vs
// already_approved vs already_denied vs not_found) — the underlying
// `approveDeviceCode` primitive race-guards on `status = pending`,
// so a code that flipped between this lookup and the update will
// fall through and return `false`, which we don't currently
// distinguish from the lookup outcomes; concurrent same-user
// approve/approve is benign (idempotent) and concurrent
// approve/deny is rare enough that the lookup-pre-check is
// sufficient for the v0.1.0 UX.
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
    );
    return { ok: true as const };
  });
