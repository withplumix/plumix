import type { ListingPageTarget, ResolvedNode, TemplateData } from "plumix";

/** Shared by head and route, so both name a page the same way. */
export type CardTarget =
  ListingPageTarget | { readonly kind: "entry"; readonly id: number };

/**
 * Derived from the page's own data, so head and route resolve the same rule. A
 * listing card is always rendered from the archive's first page.
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
          kind: "entry",
          entryType: data.entry.type,
          slug: data.entry.slug,
          databaseId: data.entry.id,
        },
      };
    case "term":
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
    case "entryType":
      return listing(data.pagination.page, {
        target: { kind: "entryType", entryType: data.contentType },
        node: { kind: "entryType", entryType: data.contentType },
      });
    case "frontPage":
      return listing(data.pagination.page, {
        target: { kind: "frontPage" },
        node: { kind: "frontPage" },
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
 * Keeps the published spelling (`front-page`, `archive/<type>`) rather than the
 * page kind's, since stored cards and URLs use it.
 */
export function cardTargetPath(target: CardTarget): string {
  switch (target.kind) {
    case "frontPage":
      return "front-page";
    case "entryType":
      return `archive/${target.entryType}`;
    case "date":
      return `date/${dateSegment(target)}`;
    default:
      return `${target.kind}/${String(target.id)}`;
  }
}

/**
 * One segment, so every target is exactly one. The year is padded because
 * `DATE` reads exactly four digits.
 */
function dateSegment(target: Extract<CardTarget, { kind: "date" }>): string {
  const parts = [String(target.year).padStart(4, "0")];
  if (target.month !== null) parts.push(pad2(target.month));
  if (target.day !== null) parts.push(pad2(target.day));
  return parts.join("-");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 15 digits max keeps a parsed id below Number.MAX_SAFE_INTEGER; a leading
 * non-zero digit keeps `01` from naming the same row as `1`, which would be two
 * URLs holding one card.
 */
const ID = /^[1-9]\d{0,14}$/;
/**
 * The characters a registered entry type's name is made of. A name outside them
 * has no archive route either, so refusing it here costs nothing.
 */
const ENTRY_TYPE = /^[a-z][a-z0-9_-]{0,63}$/;
const DATE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

/** Shape only: an accepted date can still be the 31st of February. */
export function parseCardTargetPath(path: string): CardTarget | null {
  const [kind, target, ...rest] = path.split("/");
  if (rest.length > 0) return null;
  if (kind === "front-page") {
    return target === undefined ? { kind: "frontPage" } : null;
  }
  if (target === undefined) return null;

  switch (kind) {
    case "entry":
    case "term":
    case "author":
      return ID.test(target) ? { kind, id: Number.parseInt(target, 10) } : null;
    case "archive":
      return ENTRY_TYPE.test(target)
        ? { kind: "entryType", entryType: target }
        : null;
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
