import { spellTermCapability } from "../../../access/contract/capability.js";
import { eq } from "../../../db/index.js";
import { terms } from "../../../db/schema/terms.js";
import { leaseProcedures } from "../../concurrency.js";

/** Only someone who may edit the term may hold its lease. */
export const { acquire, renew, release } = leaseProcedures(
  "term",
  async (context, id, errors) => {
    const [term] = await context.db
      .select({ taxonomy: terms.taxonomy })
      .from(terms)
      .where(eq(terms.id, id));
    if (!term) throw errors.NOT_FOUND({ data: { kind: "term", id } });
    const editCap = spellTermCapability(term.taxonomy, "edit");
    if (!context.auth.can(editCap)) {
      throw errors.FORBIDDEN({ data: { capability: editCap } });
    }
  },
);
