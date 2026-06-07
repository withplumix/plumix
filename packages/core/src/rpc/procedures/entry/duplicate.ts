import type { NewEntry } from "../../../db/schema/entries.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { canReadEntry, entryCapability } from "./lifecycle.js";
import { decodeMetaBag } from "./meta.js";
import { entryDuplicateInputSchema } from "./schemas.js";
import { applyTermPatch, loadEntryTerms } from "./terms.js";

// Bounded retry so two duplicates of the same source don't collide on
// the `(type, slug)` unique index: "original-copy", "original-copy-2", …
const MAX_SLUG_ATTEMPTS = 50;

export const duplicate = base
  .use(authenticated)
  .input(entryDuplicateInputSchema)
  .handler(async ({ input, context, errors }) => {
    const filtered = await context.hooks.applyFilter(
      "rpc:entry.duplicate:input",
      input,
    );

    const source = await context.db.query.entries.findFirst({
      where: eq(entries.id, filtered.id),
    });
    // Reserved internal rows (revision/autosave) aren't first-class
    // entries — 404 them so duplicate can't smuggle a reserved-type row
    // into the table or leak a snapshot's content. `canReadEntry` would
    // also reject these (no read cap on reserved types), but the explicit
    // guard mirrors `entry.create` / `entry.get`.
    if (!source || isReservedType(source.type)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    // The copy reads the source's content, so gate on readability first —
    // a create cap alone would let a caller harvest a draft they can't
    // see. 404 (not 403) to avoid leaking the row's existence, matching
    // `entry.get`.
    if (!canReadEntry(context, source)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: filtered.id } });
    }

    // Duplicating is also a create on the source's type — gate on the same
    // capability `entry.create` uses, not the source's delete/edit caps.
    const createCapability = entryCapability(source.type, "create");
    if (!context.auth.can(createCapability)) {
      throw errors.FORBIDDEN({ data: { capability: createCapability } });
    }

    const candidate: NewEntry = {
      type: source.type,
      title: `${source.title} (copy)`,
      slug: source.slug,
      content: source.content,
      excerpt: source.excerpt,
      status: "draft",
      // Keep the source's parent — the copy stays a sibling. A deleted
      // parent already nulled this via the FK's ON DELETE SET NULL, so
      // there's no dangling reference to revalidate.
      parentId: source.parentId,
      sortOrder: source.sortOrder,
      authorId: context.user.id,
      publishedAt: null,
      // Copy the raw meta JSON verbatim — it was already sanitized on
      // the source, so no decode/re-validate round trip is needed.
      meta: source.meta,
    };

    let created: typeof entries.$inferSelect | undefined;
    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
      const slug =
        attempt === 1
          ? `${source.slug}-copy`
          : `${source.slug}-copy-${String(attempt)}`;
      [created] = await context.db
        .insert(entries)
        .values({ ...candidate, slug })
        .onConflictDoNothing({ target: [entries.type, entries.slug] })
        .returning();
      if (created) break;
    }
    if (!created) {
      throw errors.CONFLICT({ data: { reason: "slug_taken" } });
    }

    const sourceTerms = await loadEntryTerms(context, source.id);
    if (Object.keys(sourceTerms).length > 0) {
      await applyTermPatch(context, created.id, sourceTerms);
    }

    const meta = decodeMetaBag(context.plugins, created, created.meta);

    return context.hooks.applyFilter("rpc:entry.duplicate:output", {
      ...created,
      meta,
    });
  });
