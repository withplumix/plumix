import { and, asc, eq, isNull, like } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { taxonomyCapability } from "./helpers.js";
import { termListInputSchema } from "./schemas.js";

export const list = base
  .use(authenticated)
  .input(termListInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:term.list:input",
      input,
    );

    if (!context.plugins.taxonomies.has(filtered.taxonomy)) {
      throw errors.NOT_FOUND({
        data: { kind: "taxonomy", id: filtered.taxonomy },
      });
    }

    const readCap = taxonomyCapability(filtered.taxonomy, "read");
    if (!context.auth.can(readCap)) {
      throw errors.FORBIDDEN({ data: { capability: readCap } });
    }

    const conditions = [eq(terms.taxonomy, filtered.taxonomy)];
    if (filtered.parentId === null) {
      conditions.push(isNull(terms.parentId));
    } else if (filtered.parentId !== undefined) {
      conditions.push(eq(terms.parentId, filtered.parentId));
    }
    if (filtered.search && filtered.search.length > 0) {
      conditions.push(like(terms.name, `%${filtered.search}%`));
    }

    const rows = await context.db
      .select()
      .from(terms)
      .where(and(...conditions))
      .orderBy(asc(terms.name), asc(terms.id))
      .limit(filtered.limit)
      .offset(filtered.offset);

    return context.hooks.applyFilter("rpc:term.list:output", rows);
  });
