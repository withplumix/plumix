import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { fireEntryRestored, loadDeletableEntry } from "./lifecycle.js";
import { entryRestoreInputSchema } from "./schemas.js";

export const restore = base
  .use(authenticated)
  .input(entryRestoreInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.restore:input",
      input,
    );

    const existing = await loadDeletableEntry(context, filtered.id, {
      notFound: (id) => {
        throw errors.NOT_FOUND({ data: { kind: "entry", id } });
      },
      forbidden: (capability) => {
        throw errors.FORBIDDEN({ data: { capability } });
      },
    });

    if (existing.status !== "trash") {
      throw errors.CONFLICT({ data: { reason: "not_trashed" } });
    }

    const [restored] = await context.db
      .update(entries)
      .set({ status: "draft" })
      .where(eq(entries.id, existing.id))
      .returning();
    if (!restored) {
      throw errors.CONFLICT({ data: { reason: "restore_failed" } });
    }

    await fireEntryRestored(context, restored);
    return context.hooks.applyFilter("rpc:entry.restore:output", restored);
  });
