import { and, desc, eq, like } from "../../../db/index.js";
import { users } from "../../../db/schema/users.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { userListInputSchema } from "./schemas.js";

const CAPABILITY = "user:list";

export const list = base
  .use(authenticated)
  .input(userListInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }
    const filtered = await context.hooks.applyFilter(
      "rpc:user.list:input",
      input,
    );

    const conditions = [];
    if (filtered.role) conditions.push(eq(users.role, filtered.role));
    if (filtered.search && filtered.search.length > 0) {
      conditions.push(like(users.email, `%${filtered.search}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await context.db
      .select()
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt), desc(users.id))
      .limit(filtered.limit)
      .offset(filtered.offset);

    return context.hooks.applyFilter("rpc:user.list:output", rows);
  });
