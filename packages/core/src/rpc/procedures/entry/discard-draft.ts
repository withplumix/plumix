import * as v from "valibot";

import { loadAuthoredEntry } from "../../../entries/authored.js";
import { assertCanEditEntry } from "../../../entries/editability.js";
import { deleteAutosave } from "../../../revisions/repository.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { idParam } from "../../validation.js";
import { fireEntryAutosaveDiscarded } from "./lifecycle.js";

const discardDraftInput = v.object({ id: idParam });

// Removes the caller's own pending autosave for an entry.
// Returns `{ discarded }` so the client can distinguish "we cleaned
// up your row" from "there was nothing to clean up" — both happy
// paths, neither an error.
export const discardDraft = base
  .use(authenticated)
  .input(discardDraftInput)
  .handler(async ({ input, context, errors }) => {
    const live = await loadAuthoredEntry(context.db, input.id);
    if (!live) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: input.id } });
    }
    assertCanEditEntry(context, live, errors);
    const discarded = await deleteAutosave(context.db, {
      entryId: live.id,
      authorId: context.user.id,
    });
    if (discarded) {
      await fireEntryAutosaveDiscarded(context, live, context.user.id);
    }
    return { discarded };
  });
