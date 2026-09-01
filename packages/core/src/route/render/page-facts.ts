import type { TemplateData } from "../../theme.js";
import type {
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
} from "./resolved-entry.js";

/**
 * What a page *is*, normalized across every render payload: a consumer that
 * reasons about the page — an SEO plugin deciding indexability, a feed naming
 * its scope — reads one record rather than re-deriving the same projection off
 * each arm of the payload union.
 *
 * Every subject is null on a page that has none: only a single entry has
 * timestamps, only a term archive has a term, and only an entry or an author
 * archive has an author.
 */
export interface PageFacts {
  readonly kind: TemplateData["kind"];
  /** 1-based pagination index; 1 on a page that does not paginate. */
  readonly page: number;
  /** Null on an entry that has never been published, and on every non-entry. */
  readonly published: Date | null;
  readonly modified: Date | null;
  readonly author: ResolvedAuthor | null;
  readonly term: ResolvedTerm | null;
  readonly entry: ResolvedEntry | null;
  /**
   * The entry type an entry-type archive lists, and null everywhere else —
   * including on a single entry, whose own type is on `entry`.
   *
   * A date or author archive spans every type, and a plugin archive's payload
   * is its own, so neither names one.
   */
  readonly contentType: string | null;
  /**
   * What the visitor typed, on a page that answers a query they supplied —
   * core's search page, and a plugin archive that states one. Null on a page
   * that answers none, which is not the same as the empty string a search
   * submitted with nothing in the box carries.
   */
  readonly query: string | null;
}

const NO_SUBJECT = {
  published: null,
  modified: null,
  author: null,
  term: null,
  entry: null,
  contentType: null,
  query: null,
} as const;

/**
 * Read {@link PageFacts} off a render payload.
 *
 * Discriminates on `kind` rather than field presence: a plugin archive's
 * payload is arbitrary, so an `"entry" in data` check would read one plugin's
 * field as core's subject. The two fields it does read off such a payload are
 * core's own — `CustomArchiveData` declares them for an archive to state.
 */
export function pageFacts(data: TemplateData): PageFacts {
  switch (data.kind) {
    case "entry":
      return {
        ...NO_SUBJECT,
        kind: data.kind,
        page: 1,
        published: data.entry.publishedAt,
        modified: data.entry.updatedAt,
        author: data.entry.author,
        entry: data.entry,
      };
    case "taxonomy":
      return {
        ...NO_SUBJECT,
        kind: data.kind,
        page: data.pagination.page,
        term: data.term,
      };
    case "author":
      return {
        ...NO_SUBJECT,
        kind: data.kind,
        page: data.pagination.page,
        author: data.author,
      };
    case "archive":
      return {
        ...NO_SUBJECT,
        kind: data.kind,
        page: data.pagination.page,
        contentType: data.contentType,
      };
    case "date":
    case "frontPage":
      return { ...NO_SUBJECT, kind: data.kind, page: data.pagination.page };
    case "search":
      return {
        ...NO_SUBJECT,
        kind: data.kind,
        page: data.pagination.page,
        query: data.query,
      };
    case "custom":
      return {
        ...NO_SUBJECT,
        kind: data.kind,
        page: data.page ?? 1,
        query: data.query ?? null,
      };
    case "error":
      return { ...NO_SUBJECT, kind: data.kind, page: 1 };
  }
}
