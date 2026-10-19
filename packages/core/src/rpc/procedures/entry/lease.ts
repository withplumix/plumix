import { loadAuthoredEntry } from "../../../entries/authored.js";
import { assertCanEditEntry } from "../../../entries/editability.js";
import { leaseProcedures } from "../../concurrency.js";

/** Only someone who may edit the entry may hold its lease. */
export const { acquire, renew, release } = leaseProcedures(
  "entry",
  async (context, id, errors) => {
    const entry = await loadAuthoredEntry(context.db, id);
    if (!entry) throw errors.NOT_FOUND({ data: { kind: "entry", id } });
    assertCanEditEntry(context, entry, errors);
  },
);
