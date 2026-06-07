import { and, eq, like, or } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { AUTOSAVE_TYPE, REVISION_TYPE } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { fireEntryDeleted, loadDeletableEntry } from "./lifecycle.js";
import { entryDeletePermanentInputSchema } from "./schemas.js";

export const deletePermanent = base
  .use(authenticated)
  .input(entryDeletePermanentInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.deletePermanent:input",
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

    // Revisions and autosaves are separate entry rows linked to the live
    // entry only through their encoded slugs, so they need explicit
    // cleanup — entry_term rows cascade via FK, children re-root via
    // `ON DELETE SET NULL`.
    await context.db
      .delete(entries)
      .where(
        or(
          and(
            eq(entries.type, REVISION_TYPE),
            like(entries.slug, `revision:${String(existing.id)}:%`),
          ),
          and(
            eq(entries.type, AUTOSAVE_TYPE),
            like(entries.slug, `autosave:${String(existing.id)}:%`),
          ),
        ),
      );
    await context.db.delete(entries).where(eq(entries.id, existing.id));

    await fireEntryDeleted(context, existing);
    return context.hooks.applyFilter(
      "rpc:entry.deletePermanent:output",
      existing,
    );
  });
