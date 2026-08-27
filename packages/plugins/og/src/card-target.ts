import type { ListingPageTarget, ResolvedNode, TemplateData } from "plumix";

/**
 * The page a card is *about*, named by identity rather than by URL — what the
 * head derives from the page it is rendering and what the route parses back out
 * of the path it was asked for. One vocabulary for both, because a head that
 * named a page differently from the route would advertise a URL the route
 * answers about something else.
 *
 * An entry plus core's own listing pages, structurally rather than by
 * restatement: everything but the entry is handed straight to
 * `resolveListingPage`, and the page kinds absent from it are absent for the
 * reasons that export gives.
 */
export type CardTarget =
  ListingPageTarget | { readonly kind: "entry"; readonly id: number };

/**
 * What a card rule resolves a page against: the page named as a URL can carry
 * it, and the node a matcher matches on. Emitted together, from one switch,
 * because a page that cannot be addressed has no rule to match either — and
 * derived from the page's own data rather than taken from whoever resolved it,
 * so the head and the route, which arrive at the same page by completely
 * different paths, cannot resolve to different rules and then disagree about
 * the card's size.
 *
 * A listing says which paginated slice it is, because a card names the whole
 * archive and is always rendered from the archive's first page.
 */
export type CardIdentity =
  | {
      readonly kind: "entry";
      readonly target: Extract<CardTarget, { kind: "entry" }>;
      readonly node: ResolvedNode;
    }
  | {
      readonly kind: "listing";
      readonly target: ListingPageTarget;
      readonly node: ResolvedNode;
      readonly page: number;
    };

export function cardIdentityFor(data: TemplateData): CardIdentity | null {
  switch (data.kind) {
    case "entry":
      return {
        kind: "entry",
        target: { kind: "entry", id: data.entry.id },
        node: {
          kind: "content",
          entryType: data.entry.type,
          slug: data.entry.slug,
          databaseId: data.entry.id,
        },
      };
    case "taxonomy":
      return listing(data.pagination.page, {
        target: { kind: "term", id: data.term.id },
        node: {
          kind: "term",
          taxonomy: data.taxonomy,
          slug: data.term.slug,
          databaseId: data.term.id,
        },
      });
    case "author":
      return listing(data.pagination.page, {
        target: { kind: "author", id: data.author.id },
        node: {
          kind: "author",
          slug: data.author.slug,
          databaseId: data.author.id,
        },
      });
    case "archive":
      return listing(data.pagination.page, {
        target: { kind: "archive", entryType: data.contentType },
        node: { kind: "content-type-archive", entryType: data.contentType },
      });
    case "frontPage":
      return listing(data.pagination.page, {
        target: { kind: "front-page" },
        node: { kind: "front-page" },
      });
    case "date": {
      const at = { year: data.year, month: data.month, day: data.day };
      return listing(data.pagination.page, {
        target: { kind: "date", ...at },
        node: { kind: "date", ...at },
      });
    }
    default:
      return null;
  }
}

function listing(
  page: number,
  of: { readonly target: ListingPageTarget; readonly node: ResolvedNode },
): CardIdentity {
  return { kind: "listing", page, ...of };
}

/**
 * How a target is spelled in a URL: the kind, then the one segment naming which
 * page of that kind — `entry/12`, `term/3`, `date/2026-03`. The front page is
 * the one kind with a single page, so it is the one kind with no target segment.
 *
 * The same string is the last segments of both the card's URL and its storage
 * key, which is what "the URL is the key" means here — structurally, rather
 * than as a claim two string literals have to keep agreeing on.
 */
export function cardTargetPath(target: CardTarget): string {
  switch (target.kind) {
    case "front-page":
      return "front-page";
    case "archive":
      return `archive/${target.entryType}`;
    case "date":
      return `date/${dateSegment(target)}`;
    default:
      return `${target.kind}/${String(target.id)}`;
  }
}

// `YYYY`, `YYYY-MM` or `YYYY-MM-DD` — one segment, so every target is exactly
// one, and a date archive cannot be told apart from a digest by segment count.
// The year is padded because `DATE` below reads exactly four digits; the card's
// own headline is not, because that tracks the title core gives the archive.
function dateSegment(target: Extract<CardTarget, { kind: "date" }>): string {
  const parts = [String(target.year).padStart(4, "0")];
  if (target.month !== null) parts.push(pad2(target.month));
  if (target.day !== null) parts.push(pad2(target.day));
  return parts.join("-");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

// 15 digits max keeps a parsed id below Number.MAX_SAFE_INTEGER; a leading
// non-zero digit keeps `01` from naming the same row as `1`, which would be two
// URLs holding one card.
const ID = /^[1-9]\d{0,14}$/;
// The characters a registered entry type's name is made of. A name outside them
// has no archive route either, so refusing it here costs nothing.
const ENTRY_TYPE = /^[a-z][a-z0-9_-]{0,63}$/;
const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/**
 * The page a target path names, or null when it names none. Shape only —
 * whether the page exists is the resolver's answer, not the parser's, and a
 * date this accepts can still be the 31st of February.
 */
export function parseCardTargetPath(path: string): CardTarget | null {
  const [kind, target, ...rest] = path.split("/");
  if (rest.length > 0) return null;
  if (kind === "front-page") return target === undefined ? { kind } : null;
  if (target === undefined) return null;

  switch (kind) {
    case "entry":
    case "term":
    case "author":
      return ID.test(target) ? { kind, id: Number.parseInt(target, 10) } : null;
    case "archive":
      return ENTRY_TYPE.test(target) ? { kind, entryType: target } : null;
    case "date":
      return parseDate(target);
    default:
      return null;
  }
}

function parseDate(segment: string): CardTarget | null {
  const [, year, month, day] = DATE.exec(segment) ?? [];
  if (year === undefined) return null;
  return {
    kind: "date",
    year: Number.parseInt(year, 10),
    month: month === undefined ? null : Number.parseInt(month, 10),
    day: day === undefined ? null : Number.parseInt(day, 10),
  };
}
