import { and, asc, eq, like } from "../../../db/index.js";
import { options } from "../../../db/schema/options.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { optionListInputSchema } from "./schemas.js";

const CAPABILITY = "option:manage";

export const list = base
  .use(authenticated)
  .input(optionListInputSchema)
  .handler(async ({ input, context, errors }) => {
    if (!context.auth.can(CAPABILITY)) {
      throw errors.FORBIDDEN({ data: { capability: CAPABILITY } });
    }

    const conditions = [];
    if (input.autoloadedOnly === true) {
      conditions.push(eq(options.isAutoloaded, true));
    }
    if (input.prefix) {
      // SQLite's LIKE treats `_` and `%` as wildcards. Option names commonly
      // contain underscores (e.g. `mail_smtp_host`), and escaping would need
      // an ESCAPE clause drizzle doesn't expose on `like()`. Treating them
      // as wildcards is an acceptable minor over-match — this is an admin-
      // only surface and the name shape is already constrained by valibot.
      conditions.push(like(options.name, `${input.prefix}%`));
    }
    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await context.db
      .select()
      .from(options)
      .where(where)
      .orderBy(asc(options.name))
      .limit(input.limit)
      .offset(input.offset);

    return context.hooks.applyFilter("rpc:option.list:output", rows);
  });
