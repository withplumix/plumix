import {
  denyDeviceCode,
  lookupDeviceCodeByUserCode,
} from "../../../../auth/device-flow.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { assertLookupOk } from "./lookup-helpers.js";
import { deviceFlowDenyInputSchema } from "./schemas.js";

// Explicitly reject a pending device-flow approval. The polling
// client gets `access_denied` (RFC 8628 §3.5) on its next exchange
// and stops polling — faster feedback than waiting out the TTL.
//
// Privacy tradeoff: surfacing `denied` does leak "user is online and
// rejected this prompt" to the polling client. We accept it for the
// UX win — operators concerned about the signal can simply not
// expose a Deny button (the row expires naturally).
//
// Same lookup-then-act shape as approve so a code that expired
// between page render and click surfaces the right error.
export const deny = base
  .use(authenticated)
  .input(deviceFlowDenyInputSchema)
  .handler(async ({ input, context, errors }) => {
    const found = await lookupDeviceCodeByUserCode(context.db, input.userCode);
    const ok = assertLookupOk(found, input.userCode, errors);

    await denyDeviceCode(context.db, { id: ok.id });
    await context.hooks.doAction(
      "device_code:denied",
      { id: ok.id, userCode: input.userCode },
      { actor: context.user },
    );
    return { ok: true as const };
  });
