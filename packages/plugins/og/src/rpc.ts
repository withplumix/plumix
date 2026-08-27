import type { AppContext } from "plumix/plugin";
import type { Entry } from "plumix/schema";
import { buildResolvedEntries, entryCapability, getAutosave } from "plumix";
import { eq } from "plumix/db";
import { authenticated, base } from "plumix/plugin";
import { entries } from "plumix/schema";
import * as v from "valibot";

import type { CardInputs } from "./card-identity.js";
import type { CardRegistry } from "./card-registry.js";
import type { CardPreview } from "./preview.js";
import type { CardRenderer } from "./renderer.js";
import { previewCard } from "./preview.js";

export interface OgRouterOptions {
  readonly cards: CardRegistry;
  readonly renderer: CardRenderer;
  readonly inputs: () => CardInputs;
  /** The extension a card reaches the page head under, if any. */
  readonly extension: string | undefined;
  /** The entry types the site asked for a preview on. */
  readonly entryTypes: readonly string[];
}

interface RouterErrors {
  readonly FORBIDDEN: (opts: { data: { capability: string } }) => Error;
  readonly NOT_FOUND: (opts: { data: { kind: string; id: number } }) => Error;
}

/**
 * The plugin's admin surface: one procedure, answering what the entry being
 * edited will be shared with. Read-only by design — a per-entry override would
 * be a second precedence authority beside the role markers.
 */
export function createOgRouter(options: OgRouterOptions) {
  const preview = base
    .use(authenticated)
    .input(
      v.object({ entryId: v.pipe(v.number(), v.integer(), v.minValue(1)) }),
    )
    .handler(async ({ input, context, errors }): Promise<CardPreview> => {
      const row = await previewableEntry(
        context,
        input.entryId,
        options,
        errors,
      );
      const [entry] = await buildResolvedEntries(context, [row]);
      if (entry === undefined) {
        throw errors.NOT_FOUND({
          data: { kind: "entry", id: input.entryId },
        });
      }
      return previewCard({
        data: { kind: "entry", entry },
        ctx: context,
        cards: options.cards,
        renderer: options.renderer,
        inputs: options.inputs(),
        extension: options.extension,
      });
    });

  return { preview };
}

/**
 * The entry as its editor currently has it, for a caller who may edit it.
 *
 * A card carries the entry's title, and a draft's title is not public yet — so
 * the gate is the editor's own, not the read gate a published entry would pass
 * for anyone. Nothing rendered here is stored or served to anyone else; with a
 * `remote()` renderer connected the card's content does reach the endpoint that
 * renderer names, which is the operator's own service.
 *
 * The caller's pending autosave is overlaid the way `entry.get`'s preview mode
 * does it: on a type supporting autosave, a *published* entry's meta edits land
 * on a per-user draft row rather than the live one, so the live row alone would
 * answer with the state before the author's last change — exactly the question
 * this procedure exists to answer. `title` stays live, since the editor writes
 * it straight to the live row and publish never promotes it.
 */
async function previewableEntry(
  ctx: AppContext,
  entryId: number,
  options: OgRouterOptions,
  errors: RouterErrors,
): Promise<Entry> {
  const notFound = errors.NOT_FOUND({ data: { kind: "entry", id: entryId } });
  const [row] = await ctx.db
    .select()
    .from(entries)
    .where(eq(entries.id, entryId))
    .limit(1);
  // A type the site never asked for a preview on has no meta box to ask from,
  // so the procedure answers for exactly what registered it.
  if (row === undefined || !options.entryTypes.includes(row.type)) {
    throw notFound;
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
