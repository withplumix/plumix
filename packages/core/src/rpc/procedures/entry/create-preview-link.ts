import { createPreviewToken } from "../../../auth/preview-token.js";
import { eq } from "../../../db/index.js";
import { entries } from "../../../db/schema/entries.js";
import { isReservedType } from "../../../revisions/slug-codec.js";
import { buildEntryPermalink } from "../../../route/permalink.js";
import { authenticated } from "../../authenticated.js";
import { base } from "../../base.js";
import { canReadEntry } from "./lifecycle.js";
import { entryCreatePreviewLinkInputSchema } from "./schemas.js";

// Mint a shareable, entry-scoped, expiring preview link so a draft can be
// shown to someone without an account. Gated by `canReadEntry` — the same
// rule `entry.get`/`entry.duplicate` use — so only someone who can already
// see the draft (its author with `edit_own`, or an `edit_any` editor) can
// hand it out. 404 (not 403) on an unreadable or missing entry to avoid
// leaking which rows exist.
export const createPreviewLink = base
  .use(authenticated)
  .input(entryCreatePreviewLinkInputSchema)
  .handler(async ({ input, context, errors }) => {
    const entry = await context.db.query.entries.findFirst({
      where: eq(entries.id, input.id),
    });
    if (!entry || isReservedType(entry.type) || !canReadEntry(context, entry)) {
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
