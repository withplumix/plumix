import { eq } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userGetInputSchema } from "./schemas.js";

// Listing gates access to arbitrary user records; self-lookup is always
// allowed via `user:edit_own` so admin UIs can render "your profile".
const LIST_CAPABILITY = "user:list";

export const get = base
  .use(authenticated)
  .input(userGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    const isSelf = context.user.id === input.id;
    if (!isSelf && !context.auth.can(LIST_CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: LIST_CAPABILITY } });
    }

    const row = await context.db.query.users.findFirst({
      where: eq(users.id, input.id),
    });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "user", id: input.id } });
    }
    return context.hooks.applyFilter("rpc:user.get:output", row);
  });
