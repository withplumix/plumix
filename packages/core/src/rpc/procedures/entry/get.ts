import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryCapability } from "./lifecycle.js";
import { decodeMetaBag } from "./meta.js";
import { entryGetInputSchema } from "./schemas.js";
import { loadEntryTerms } from "./terms.js";

export const get = base
  .use(authenticated)
  .input(entryGetInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.get:input",
      input,
    );

    const row = await context.db.query.entries.findFirst({
      where: eq(entries.id, filtered.id),
    });
    if (!row) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    if (!context.auth.can(entryCapability(row.type, "read"))) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    if (row.status !== "published") {
      const canSeeAny = context.auth.can(entryCapability(row.type, "edit_any"));
      const ownsAndCanEdit =
        row.authorId === context.user.id &&
        context.auth.can(entryCapability(row.type, "edit_own"));
      if (!canSeeAny && !ownsAndCanEdit) {
        throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
      }
    }

    const meta = decodeMetaBag(context.plugins, row, row.meta);
    const terms = await loadEntryTerms(context, row.id);
    return context.hooks.applyFilter("rpc:entry.get:output", {
      ...row,
      meta,
      terms,
    });
  });
