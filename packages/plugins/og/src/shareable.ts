import type { ArchiveTypeData, TemplateData } from "plumix";
import type { EntryAccessSubject } from "plumix/auth";
import type { AppContext } from "plumix/plugin";
import { anonymousContext, entryPolicyAdmits } from "plumix/auth";

import { isListingArchive } from "./card-target.js";

/**
 * A listing needs at least one published entry, so strangers can't fill the
 * bucket via enumerable empty archives. The front page always qualifies.
 */
export async function isShareablePage(
  ctx: AppContext,
  data: TemplateData,
): Promise<boolean> {
  switch (data.kind) {
    case "entry":
      return isShareableEntry(ctx, data.entry);
    case "frontPage":
      return true;
    // The only listing kind core gates by access; a public cached card could
    // otherwise show gated titles.
    case "entryType":
      return (
        data.pagination.total > 0 &&
        (await entryPolicyAdmits(
          anonymousContext(ctx),
          { type: data.contentType },
          "listing",
        ))
      );
    case "term":
    case "author":
    case "date":
      return data.pagination.total > 0;
    case "archiveType":
      return isShareableArchiveType(ctx, data);
    // Search and views have no card URL to be shareable at.
    default:
      return false;
  }
}

/**
 * A policied archive renders live, so only a policy granting an anonymous
 * visitor the page lets a public, shared-cached card stand for it.
 */
async function isShareableArchiveType(
  ctx: AppContext,
  data: ArchiveTypeData,
): Promise<boolean> {
  const archive = ctx.plugins.archiveTypes.get(data.name);
  if (archive === undefined) return false;
  if (isListingArchive(data) && data.pagination.total === 0) return false;
  if (archive.access === undefined) return true;
  const outcome = await archive.access.resolve(anonymousContext(ctx));
  return outcome.type === "grant";
}

/** {@link isShareablePage} minus the status check, so drafts preview. */
export function isPreviewablePage(
  ctx: AppContext,
  data: TemplateData,
): Promise<boolean> {
  return data.kind === "entry"
    ? isReachableEntry(ctx, data.entry)
    : isShareablePage(ctx, data);
}

/**
 * Whether an entry may have a card. Status is checked because the head reaches
 * this on a preview render, where the entry is a draft.
 */
export async function isShareableEntry(
  ctx: AppContext,
  entry: EntryAccessSubject & { readonly status: string },
): Promise<boolean> {
  if (entry.status !== "published") return false;
  return isReachableEntry(ctx, entry);
}

/**
 * Asks access as an anonymous visitor whoever is calling: a card is public and
 * shared-cached. An unregistered type counts as private.
 */
export async function isReachableEntry(
  ctx: AppContext,
  entry: EntryAccessSubject,
): Promise<boolean> {
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  if (!entryType?.isPublic) return false;
  return entryPolicyAdmits(anonymousContext(ctx), entry, "listing");
}
