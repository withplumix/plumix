import * as v from "valibot";

import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { deleteAutosave } from "../../../revisions/repository.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../validation.js";
import { entryCapability, fireEntryAutosaveDiscarded } from "./lifecycle.js";

const discardDraftInput = v.object({ id: idParam });

// Removes the caller's own pending autosave for an entry. Gated by
// edit_own (for the entry's author) OR edit_any (for editors+).
// Returns `{ discarded }` so the client can distinguish "we cleaned
// up your row" from "there was nothing to clean up" — both happy
// paths, neither an error.
export const discardDraft = base
  .use(authenticated)
  .input(discardDraftInput)
  .handler(async ({ input, context, errors }) => {
    const live = await context.db.query.entries.findFirst({
      where: eq(entries.id, input.id),
    });
    if (!live || isReservedType(live.type)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: input.id } });
    }
    const isAuthor = live.authorId === context.user.id;
    const editOwnCapability = entryCapability(live.type, "edit_own");
    const editAnyCapability = entryCapability(live.type, "edit_any");
    const canEdit =
      (isAuthor && context.auth.can(editOwnCapability)) ||
      context.auth.can(editAnyCapability);
    if (!canEdit) {
      throw errors.FORBIDDEN({ data: { capability: editAnyCapability } });
    }
    const discarded = await deleteAutosave(context.db, {
      entryId: live.id,
      authorId: context.user.id,
    });
    if (discarded) {
      await fireEntryAutosaveDiscarded(context, live, context.user.id);
    }
    return { discarded };
  });
