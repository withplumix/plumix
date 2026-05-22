import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { getAutosave } from "../../../revisions/repository.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
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
    // Reserved-type rows (revisions, autosaves) surface through their
    // dedicated endpoints only — their existence here shouldn't be
    // observable, so 404 (not BAD_REQUEST).
    if (isReservedType(row.type)) {
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

    // Preview mode: overlay the caller's autosave (if any) onto the
    // live row's read fields, leaving `id` / `slug` / `parentId` /
    // `authorId` / `updatedAt` / `createdAt` etc. anchored to live.
    // Gated by edit_own / edit_any because previewing a pending draft
    // is an editor concern.
    if (filtered.preview) {
      const canSeeAny = context.auth.can(entryCapability(row.type, "edit_any"));
      const ownsAndCanEdit =
        row.authorId === context.user.id &&
        context.auth.can(entryCapability(row.type, "edit_own"));
      if (!canSeeAny && !ownsAndCanEdit) {
        throw errors.FORBIDDEN({
          data: { capability: entryCapability(row.type, "edit_own") },
        });
      }
      const autosave = await getAutosave(context.db, {
        entryId: row.id,
        authorId: context.user.id,
      });
      const source: "autosave" | "live" = autosave ? "autosave" : "live";
      const overlaid = autosave
        ? {
            ...row,
            title: autosave.title,
            content: autosave.content,
            excerpt: autosave.excerpt,
            meta: autosave.meta,
          }
        : row;
      const meta = decodeMetaBag(context.plugins, overlaid, overlaid.meta);
      const terms = await loadEntryTerms(context, row.id);
      return context.hooks.applyFilter("rpc:entry.get:output", {
        ...overlaid,
        meta,
        terms,
        _preview: {
          source,
          autosaveUpdatedAt: autosave?.updatedAt ?? null,
          liveUpdatedAt: row.updatedAt,
        },
      });
    }

    const meta = decodeMetaBag(context.plugins, row, row.meta);
    const terms = await loadEntryTerms(context, row.id);
    return context.hooks.applyFilter("rpc:entry.get:output", {
      ...row,
      meta,
      terms,
    });
  });
