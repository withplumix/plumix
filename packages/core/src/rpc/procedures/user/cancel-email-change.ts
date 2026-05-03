import { cancelEmailChange } from "../../../auth/email-change/index.js";
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userCancelEmailChangeInputSchema } from "./schemas.js";

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";

// Cancel an outstanding email-change verification. Idempotent — a
// user with no pending request gets `{ cancelled: 0 }`. Same auth
// gating as `requestEmailChange`: self via `user:edit_own`, other
// via `user:edit`.
//
// No hook fires for cancellation — the audit log can derive it
// from the absence of a `user:email_changed` between two adjacent
// `user:email_change_requested` events. Lower noise on the audit
// surface.
export const cancelEmailChangeProc = base
  .use(authenticated)
  .input(userCancelEmailChangeInputSchema)
  .handler(async ({ input, context, errors }) => {
    const isSelf = input.id === context.user.id;
    const capability = isSelf ? EDIT_OWN_CAPABILITY : EDIT_CAPABILITY;
    if (!context.auth.can(capability)) {
      throw errors.FORBIDDEN({ data: { capability } });
    }

    const target = await context.db.query.users.findFirst({
      where: eq(users.id, input.id),
    });
    if (!target) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }

    return cancelEmailChange(context.db, { userId: target.id });
  });
