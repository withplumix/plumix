import { cancelEmailChange } from "../../../auth/email-change/index.js";
import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { assertCanActOnUser, userWrite } from "./helpers.js";
import { userCancelEmailChangeInputSchema } from "./schemas.js";

const EDIT_OWN_CAPABILITY = "user:edit_own";
const EDIT_CAPABILITY = "user:edit";

/**
 * No event fires: audit can infer a cancel from two adjacent
 * `auth.emailChangeRequested` events with no `auth.emailChanged` between.
 */
export const cancelEmailChangeProc = userWrite
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
    assertCanActOnUser(context, target, {
      forbidden: (capability) => {
        throw errors.FORBIDDEN({ data: { capability } });
      },
    });

    return cancelEmailChange(context.db, { userId: target.id });
  });
