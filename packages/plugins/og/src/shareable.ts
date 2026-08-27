import type { TemplateData } from "plumix";
import type { AppContext, EntryAccessSubject } from "plumix/plugin";
import { entryAllowsAnonymousAccess } from "plumix";

/**
 * Whether a page may carry a card at all — the one question the route and the
 * head both ask, so the head can never advertise a URL the route refuses.
 *
 * A listing page answers on whether it lists anything. An empty archive renders
 * a page, so this is a narrower rule than "the page exists", and deliberately:
 * a card is minted at an enumerable URL and kept immutable in storage, so the
 * date archives alone are three million URLs a stranger can spend the site's
 * bucket on, and an author card is a person's name at `author/<id>` whether or
 * not anything of theirs was ever published. "It lists at least one published
 * entry" closes both, and it is the same sentence for all four kinds.
 *
 * The front page is the exception: it is the site, and a site with nothing on it
 * yet is still the thing anyone sharing the site shares.
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
    // An archive is the one listing kind core itself gates: `policyForMatch`
    // resolves an `archive` intent against the entry type's `access.default`,
    // so a type whose own archive redirects an anonymous visitor to sign-in
    // must not have a card either — the card is public, immutable and edge
    // cached, and a theme card rendering `data.entries` would put gated titles
    // on it. The other three have no policy attached, so nothing to ask.
    case "archive":
      return (
        data.pagination.total > 0 &&
        (await entryAllowsAnonymousAccess(ctx, { type: data.contentType }))
      );
    case "taxonomy":
    case "author":
    case "date":
      return data.pagination.total > 0;
    // Search and plugin archives have no card URL to be shareable at — see
    // `CardTarget` for why neither can be addressed by identity.
    default:
      return false;
  }
}

/**
 * {@link isShareablePage} with the status half dropped, for the editor preview:
 * showing a draft's card is its whole point, while an entry whose page a scraper
 * will never reach still gets none.
 */
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
 * The half of {@link isShareableEntry} that is not about status: whether a
 * scraper could reach this entry's page at all.
 *
 * An unregistered type — a row left behind by a plugin the config no longer
 * installs — has no public page either, so it answers the same as a private
 * one. The access layer is asked last, and asked about an anonymous visitor
 * whoever is calling: a card carries the entry's title, sits at an enumerable
 * id, and is served from a shared cache, so an entry whose own page a scraper
 * never reaches must not have one either.
 */
export async function isReachableEntry(
  ctx: AppContext,
  entry: EntryAccessSubject,
): Promise<boolean> {
  const entryType = ctx.plugins.entryTypes.get(entry.type);
  if (entryType === undefined || entryType.isPublic === false) return false;
  return entryAllowsAnonymousAccess(ctx, entry);
}
