import type {
  ArchiveTypeData,
  ListingArchiveData,
  ListingPageTarget,
  ResolvedNode,
  TemplateData,
} from "plumix";
import type { ArchiveTypePageTarget } from "plumix/plugin";

/**
 * A plugin archive's page, named by its route params rather than by its route,
 * so an archive with several routes needs nothing more.
 */
type ArchiveTypeCardTarget = ArchiveTypePageTarget & {
  readonly kind: "archiveType";
};

/** Shared by head and route, so both name a page the same way. */
export type CardTarget =
  | ListingPageTarget
  | ArchiveTypeCardTarget
  | { readonly kind: "entry"; readonly id: number };

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
      readonly target: Exclude<CardTarget, { kind: "entry" }>;
      readonly node: ResolvedNode;
      readonly page: number;
    };

/**
 * `params` are the route params a plugin archive's page was matched with,
 * which its data does not carry; without them it has no identity.
 */
export function cardIdentityFor(
  data: TemplateData,
  params?: Readonly<Record<string, string>>,
): CardIdentity | null {
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
    case "archiveType":
      return params === undefined ? null : archiveTypeIdentity(data, params);
    default:
      return null;
  }
}

/**
 * A listing archive's card is its first page's, so the `page` param core
 * derives for later pages is no part of its name.
 */
function archiveTypeIdentity(
  data: ArchiveTypeData,
  params: Readonly<Record<string, string>>,
): CardIdentity {
  const listed = isListingArchive(data);
  const named = listed
    ? Object.fromEntries(Object.entries(params).filter(([k]) => k !== "page"))
    : params;
  return listing(listed ? data.pagination.page : 1, {
    target: { kind: "archiveType", name: data.name, params: named },
    node: { kind: "archiveType", name: data.name },
  });
}

/** An archive that declared `entries`, which core listed. */
export function isListingArchive(
  data: ArchiveTypeData,
): data is ListingArchiveData {
  return "pagination" in data;
}

function listing(
  page: number,
  of: {
    readonly target: Exclude<CardTarget, { kind: "entry" }>;
    readonly node: ResolvedNode;
  },
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
    case "archiveType":
      return archiveTypeSegments(target).join("/");
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

/**
 * Keys sorted, so one page has one URL whichever order its route captured
 * them in; every name and value encoded as one path segment.
 */
function archiveTypeSegments(target: ArchiveTypeCardTarget): string[] {
  const pairs = Object.entries(target.params)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .flat();
  return ["archive-type", target.name, ...pairs].map(encodeURIComponent);
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
  if (path.startsWith("archive-type/")) return parseArchiveType(path);
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

/**
 * Only the canonical spelling parses, so no second URL holds one page's card:
 * the target must print back to exactly the path it was read from.
 */
function parseArchiveType(path: string): CardTarget | null {
  const segments = path.split("/").map(decodeSegment);
  const [, name, ...pairs] = segments;
  if (name === undefined || name === null || pairs.length % 2 !== 0) {
    return null;
  }
  const params: Record<string, string> = {};
  for (let i = 0; i < pairs.length; i += 2) {
    const key = pairs[i];
    const value = pairs[i + 1];
    if (key == null || value == null || Object.hasOwn(params, key)) {
      return null;
    }
    params[key] = value;
  }
  const target: CardTarget = { kind: "archiveType", name, params };
  return cardTargetPath(target) === path ? target : null;
}

/** Null for a malformed escape: an input to refuse, not a throw. */
function decodeSegment(segment: string): string | null {
  try {
    return decodeURIComponent(segment);
  } catch {
    return null;
  }
}
