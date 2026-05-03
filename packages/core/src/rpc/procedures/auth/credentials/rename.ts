import { and, eq } from "../../../../db/index.js";
import { credentials } from "../../../../db/schema/credentials.js";
import { authenticated } from "../../../authenticated.js";
import { base } from "../../../base.js";
import { credentialsRenameInputSchema } from "./schemas.js";

// Self-scoped: the WHERE clause pins both `id` and `userId`, so a user
// can only rename their own credentials. Cross-user attempts return
// NOT_FOUND with no oracle (same shape as a non-existent id).
export const rename = base
  .use(authenticated)
  .input(credentialsRenameInputSchema)
  .handler(async ({ input, context, errors }) => {
    const [row] = await context.db
      .update(credentials)
      .set({ name: input.name })
      .where(
        and(
          eq(credentials.id, input.id),
          eq(credentials.userId, context.user.id),
        ),
      )
      .returning({
        id: credentials.id,
        name: credentials.name,
      });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "credential", id: input.id } });
    }
    return row;
  });
