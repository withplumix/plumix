import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { taxonomyCapability } from "./helpers.js";
import { decodeMetaBag } from "./meta.js";
import { termGetInputSchema } from "./schemas.js";

export const get = base
  .use(authenticated)
  .input(termGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    const row = await context.db.query.terms.findFirst({
      where: eq(terms.id, input.id),
    });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "term", id: input.id } });
    }

    const readCap = taxonomyCapability(row.taxonomy, "read");
    if (!context.auth.can(readCap)) {
      // Hide existence — mirror entry.get's "no oracle" rule.
      throw errors.NOT_FOUND({ data: { kind: "term", id: input.id } });
    }

    const meta = decodeMetaBag(context.plugins, row.taxonomy, row.meta);
    return context.hooks.applyFilter("rpc:term.get:output", {
      ...row,
      meta,
    });
  });
