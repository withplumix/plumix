import type { AppContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { buildResolvedEntries, entryCapability, getAutosave } from "plumix";
import { eq } from "plumix/db";
import { authenticated, base } from "plumix/plugin";
import { entries } from "plumix/schema";
import * as v from "valibot";

import type { SerpPreview } from "./serp.js";
import { serpPreview } from "./preview.js";

export interface SeoRouterOptions {
  /** The entry types that carry the SEO box, and so the preview. */
  readonly entryTypes: readonly string[];
}

interface RouterErrors {
  readonly FORBIDDEN: (opts: { data: { capability: string } }) => Error;
  readonly NOT_FOUND: (opts: { data: { kind: string; id: number } }) => Error;
}

/**
 * The plugin's admin surface: one procedure, answering what the entry being
 * edited will look like in a search result. Read-only — every answer an author
 * can change is a meta field on the same box, saved with the entry.
 */
export function createSeoRouter(options: SeoRouterOptions) {
  const preview = base
    .use(authenticated)
    .input(
      v.object({ entryId: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
    )
    .handler(async ({ input, context, errors }): Promise<SerpPreview> => {
      const row = await previewableEntry(
        context,
        input.entryId,
        options.entryTypes,
        errors,
      );
      const [entry] = await buildResolvedEntries(context, [row]);
      if (entry === undefined) {
        throw errors.NOT_FOUND({ data: { kind: "entry", id: input.entryId } });
      }
      return serpPreview(context, entry);
    });

  return { preview };
}

/**
 * The entry as its editor currently has it, for a caller who may edit it.
 *
 * A draft's title and excerpt are not public yet, so the gate is the editor's
 * own rather than the read gate a published entry would pass for anyone. The
 * caller's pending autosave is overlaid the way `entry.get`'s preview mode does
 * it: on a published entry, meta edits land on a per-user draft row, so the
 * live row alone would answer with the state before the author's last change.
 */
async function previewableEntry(
  ctx: AppContext,
  entryId: number,
  entryTypes: readonly string[],
  errors: RouterErrors,
): Promise<Entry> {
  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  // A type outside the box's scope has no preview field to ask from, so the
  // procedure answers for exactly what registered it.
  if (row === undefined || !entryTypes.includes(row.type)) {
    throw errors.NOT_FOUND({ data: { kind: "entry", id: entryId } });
  }
  const user = ctx.user;
  const editAny = entryCapability(row.type, "edit_any");
  const mayEdit =
    ctx.auth.can(editAny) ||
    (row.authorId === user?.id &&
      ctx.auth.can(entryCapability(row.type, "edit_own")));
  if (!mayEdit || user === null) {
    throw errors.FORBIDDEN({ data: { capability: editAny } });
  }

  const autosave = await getAutosave(ctx.db, {
    entryId: row.id,
    authorId: user.id,
  });
  return autosave === undefined
    ? row
    : {
        ...row,
        content: autosave.content,
        excerpt: autosave.excerpt,
        meta: autosave.meta,
      };
}
