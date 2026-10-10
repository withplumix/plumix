import type {
  Pagination,
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
  TargetMatcher,
  TemplateData,
  TierMatchRule,
} from "plumix";

/** A pangram, so the preview shows every letter of the face. */
const SAMPLE_TITLE = "The quick brown fox jumps over the lazy dog";
const SAMPLE_EXCERPT =
  "Sample copy, so a card is judged at the length real writing arrives in " +
  "rather than at the length its author happened to type while building it.";
const SAMPLE_SLUG = "sample-entry";
const SAMPLE_TERM_SLUG = "sample-term";
const SAMPLE_QUERY = "sample search";

/**
 * Fixed rather than `Date.now()`: a preview that re-renders on every refresh
 * must differ only by what the developer changed.
 */
const SAMPLE_DATE = new Date("2026-01-15T09:30:00.000Z");
const SAMPLE_ID = 1;

interface SampleTarget {
  readonly kind: TemplateData["kind"];
  /** Entry type, taxonomy, or registered archive-type or view name. */
  readonly type: string;
  readonly slug: string;
  readonly year: number;
  readonly month: number | null;
  readonly day: number | null;
}

const DEFAULT_TARGET: SampleTarget = {
  kind: "entry",
  type: "post",
  slug: SAMPLE_SLUG,
  year: SAMPLE_DATE.getUTCFullYear(),
  month: SAMPLE_DATE.getUTCMonth() + 1,
  day: null,
};

/**
 * Never reads the database, so it works on an empty site. A rule's `match`
 * names feed the sample, so `forEntryType("recipe")` previews a recipe.
 */
export function sampleDataFor(rule: TierMatchRule): TemplateData {
  return pageFor(targetFor(rule));
}

/** Same order as `ruleLabel`, so caption and picture agree. */
function targetFor(rule: TierMatchRule): SampleTarget {
  if (rule.tier === undefined) {
    return rule.match === undefined
      ? DEFAULT_TARGET
      : targetForMatch(rule.match);
  }
  switch (rule.tier) {
    case "entryType":
    case "term":
    case "author":
    case "date":
    case "frontPage":
    case "search":
      return { ...DEFAULT_TARGET, kind: rule.tier };
    default:
      return DEFAULT_TARGET;
  }
}

/**
 * A matcher's `nodeKind` names the same page kinds the page data does; what
 * differs per kind is which of the matcher's narrowings the sample takes.
 */
function targetForMatch(match: TargetMatcher): SampleTarget {
  const named = {
    ...DEFAULT_TARGET,
    type: match.type,
    slug: match.slug ?? DEFAULT_TARGET.slug,
  };
  switch (match.nodeKind) {
    case "entry":
    case "entryType":
    case "author":
    case "archiveType":
    case "view":
      return { ...named, kind: match.nodeKind };
    case "term":
      return { ...named, kind: "term", slug: match.slug ?? SAMPLE_TERM_SLUG };
    case "date":
      return {
        ...named,
        kind: "date",
        year: match.year ?? DEFAULT_TARGET.year,
        month: match.month ?? null,
        day: match.day ?? null,
      };
  }
}

function pageFor(target: SampleTarget): TemplateData {
  const listing = { entries: [sampleEntry(target)], pagination: PAGINATION };
  switch (target.kind) {
    case "entryType":
      return { kind: "entryType", contentType: target.type, ...listing };
    case "term":
      return {
        kind: "term",
        taxonomy: target.type,
        term: sampleTerm(target),
        ...listing,
      };
    case "author":
      return { kind: "author", author: AUTHOR, ...listing };
    case "date":
      return {
        kind: "date",
        year: target.year,
        month: target.month,
        day: target.day,
        ...listing,
      };
    case "frontPage":
      return { kind: "frontPage", ...listing };
    case "search":
      return { kind: "search", query: SAMPLE_QUERY, ...listing };
    case "archiveType":
      return { kind: "archiveType", name: target.type };
    case "view":
      return { kind: "view", name: target.type, params: {}, data: null };
    default:
      return { kind: "entry", entry: sampleEntry(target) };
  }
}

const AUTHOR: ResolvedAuthor = {
  id: SAMPLE_ID,
  slug: "sample-author",
  name: "Sample Author",
  avatarUrl: null,
  images: {},
};

const PAGINATION: Pagination = {
  page: 1,
  perPage: 10,
  total: 3,
  pageCount: 1,
};

/** A sample has no registered type, so its permalink isn't rewritten. */
function sampleEntry(target: SampleTarget): ResolvedEntry {
  const type = target.kind === "entry" ? target.type : DEFAULT_TARGET.type;
  return {
    id: SAMPLE_ID,
    type,
    parentId: null,
    title: SAMPLE_TITLE,
    slug: target.kind === "entry" ? target.slug : SAMPLE_SLUG,
    content: null,
    contentBlocks: null,
    excerpt: SAMPLE_EXCERPT,
    status: "published",
    authorId: AUTHOR.id,
    sortOrder: 0,
    meta: {},
    storedMeta: {},
    images: {},
    publishedAt: SAMPLE_DATE,
    createdAt: SAMPLE_DATE,
    updatedAt: SAMPLE_DATE,
    terms: [],
    author: AUTHOR,
    url: `/${type}/${target.kind === "entry" ? target.slug : SAMPLE_SLUG}`,
  };
}

function sampleTerm(target: SampleTarget): ResolvedTerm {
  return {
    id: SAMPLE_ID,
    taxonomy: target.type,
    name: "Sample term",
    slug: target.slug,
    description: SAMPLE_EXCERPT,
    meta: {},
    storedMeta: {},
    images: {},
    parentId: null,
    version: 0,
    url: `/${target.type}/${target.slug}`,
  };
}
