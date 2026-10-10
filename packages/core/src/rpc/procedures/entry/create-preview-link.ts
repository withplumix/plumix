import { createPreviewToken } from "../../../auth/preview-token.js";
import { loadAuthoredEntry } from "../../../entries/authored.js";
import { canReadEntry } from "../../../entries/visibility.js";
import { buildEntryPermalink } from "../../../route/permalink.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { entryCreatePreviewLinkInputSchema } from "./schemas.js";

// Gated by `canReadEntry`, so only someone who can already see the draft can
// hand it out. 404, not 403, to avoid leaking which rows exist.
export const createPreviewLink = base
  .use(authenticated)
  .input(entryCreatePreviewLinkInputSchema)
  .handler(async ({ input, context, errors }) => {
    const entry = await loadAuthoredEntry(context.db, input.id);
    if (!entry || !canReadEntry(context, entry)) {
      throw errors.NOT_FOUND({ data: { kind: "entry", id: input.id } });
    }

    // Async variant so a nested entry of a hierarchical type (e.g. a page
    // under a parent) gets its full ancestor-walked URL instead of null.
    const path = await buildEntryPermalink(context, entry);
    if (path === null) {
      throw errors.CONFLICT({ data: { reason: "no_public_url" } });
    }

    const token = await createPreviewToken(context.db, {
      entryId: entry.id,
      userId: context.user.id,
    });
    return { token, url: `${path}?preview=${token}` };
  });
