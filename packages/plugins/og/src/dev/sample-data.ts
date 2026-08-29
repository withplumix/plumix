import type {
  Pagination,
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
  TargetMatcher,
  TemplateData,
  TierMatchRule,
} from "plumix";

/**
 * Stand-in content for the preview surface. A pangram, so a preview shows every
 * letter of the face a card renders with, and long enough that a title which
 * only fits at one length is visibly wrong.
 */
const SAMPLE_TITLE = "The quick brown fox jumps over the lazy dog";
const SAMPLE_EXCERPT =
  "Sample copy, so a card is judged at the length real writing arrives in " +
  "rather than at the length its author happened to type while building it.";
const SAMPLE_SLUG = "sample-entry";
const SAMPLE_TERM_SLUG = "sample-term";
const SAMPLE_QUERY = "sample search";

// Fixed rather than `Date.now()`: a preview that re-renders on every refresh
// must differ only by what the developer changed.
const SAMPLE_DATE = new Date("2026-01-15T09:30:00.000Z");
const SAMPLE_ID = 1;

/**
 * The page a preview invents, named the way the rule that asked for it names
 * things. Flat rather than a `TemplateData` of its own, so the two switches
 * below split by responsibility — reading a rule, then building a page — and
 * neither repeats the other's literals.
 */
interface SampleTarget {
  readonly kind: TemplateData["kind"];
  /** Entry type, taxonomy, or registered archive-type name. */
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
 * The page a rule would be resolved for, invented rather than looked up. The
 * preview answers "what does my card look like" on a site with no content in it
 * yet, so nothing here reaches the database — and a rule's `match` contributes
 * the names it narrows on (`forEntryType("recipe")` previews a recipe), which
 * is what makes two rules of the same tier tell each other apart.
 */
export function sampleDataFor(rule: TierMatchRule): TemplateData {
  return pageFor(targetFor(rule));
}

// Tier first, then the matcher — the order `resolveRule`'s own `ruleLabel`
// reads a rule in, so a preview's caption and its picture cannot disagree about
// which half of a rule named it.
function targetFor(rule: TierMatchRule): SampleTarget {
  if (rule.tier === undefined) {
    return rule.match === undefined
      ? DEFAULT_TARGET
      : targetForMatch(rule.match);
  }
  switch (rule.tier) {
    case "archive":
    case "taxonomy":
    case "author":
    case "date":
    case "frontPage":
    case "search":
      return { ...DEFAULT_TARGET, kind: rule.tier };
    // `entry`, `fallback` and the error tiers all preview as a single entry:
    // it is the page kind every card is written for first, and the one whose
    // sample carries a title.
    default:
      return DEFAULT_TARGET;
  }
}

// A matcher's `nodeKind` is the resolved-node vocabulary, not the page-data
// one, so this is a translation rather than a copy of the tier switch above.
function targetForMatch(match: TargetMatcher): SampleTarget {
  const named = {
    ...DEFAULT_TARGET,
    type: match.type,
    slug: match.slug ?? DEFAULT_TARGET.slug,
  };
  switch (match.nodeKind) {
    case "content":
      return { ...named, kind: "entry" };
    case "content-type-archive":
      return { ...named, kind: "archive" };
    case "term":
      return {
        ...named,
        kind: "taxonomy",
        slug: match.slug ?? SAMPLE_TERM_SLUG,
      };
    case "author":
      return { ...named, kind: "author" };
    case "custom":
      return { ...named, kind: "custom" };
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
    case "archive":
      return { kind: "archive", contentType: target.type, ...listing };
    case "taxonomy":
      return {
        kind: "taxonomy",
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
    case "custom":
      return { kind: "custom", name: target.type };
    default:
      return { kind: "entry", entry: sampleEntry(target) };
  }
}

const AUTHOR: ResolvedAuthor = {
  id: SAMPLE_ID,
  slug: "sample-author",
  name: "Sample Author",
  avatarUrl: null,
};

const PAGINATION: Pagination = {
  page: 1,
  perPage: 10,
  total: 3,
  pageCount: 1,
};

// The permalink a real entry carries comes off the rewrite rules its type was
// registered with; a sample has no type to read those from, so the preview
// shows the unrewritten shape.
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
    parentId: null,
    version: 0,
    url: `/${target.type}/${target.slug}`,
  };
}
