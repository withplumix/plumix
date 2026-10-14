import type { MessageDescriptor } from "@lingui/core";
import { defineMessage } from "@lingui/core/macro";

import { describeRpcError } from "@plumix/core/admin";

const M = {
  errEmailTaken: defineMessage({
    id: "userInvite.error.emailTaken",
    message: "A user with that email already exists.",
  }),
  errFallback: defineMessage({
    id: "userInvite.error.fallback",
    message: "Couldn't send invite. Try again.",
  }),
} satisfies Record<string, MessageDescriptor>;

/** Map a `user.invite` failure to the copy the invite form shows: a known
 *  reason's copy, else the generic retry message. */
export function describeInviteError(err: unknown): MessageDescriptor {
  return describeRpcError(err, { email_taken: M.errEmailTaken }, M.errFallback);
}
