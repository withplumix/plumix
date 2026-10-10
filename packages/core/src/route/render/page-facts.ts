import type { TemplateData } from "../../theme.js";
import type {
  ResolvedAuthor,
  ResolvedEntry,
  ResolvedTerm,
} from "../contract/resolved-entry.js";

/**
 * What a page is, normalized across every render payload. Each subject is null
 * on a page that has none.
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
  /** Set only on an entry-type archive; a single entry's type is on `entry`. */
  readonly contentType: string | null;
  /**
   * What the visitor typed. Null on a page that answers no query, unlike the
   * empty string of a blank search.
   */
  readonly query: string | null;
  /**
   * The registered name of a view (`registerView`), and null on every other
   * page. A view's own `data` is the plugin's, so this is all core states.
   */
  readonly view: string | null;
}

const NO_SUBJECT = {
  published: null,
  modified: null,
  author: null,
  term: null,
  entry: null,
  contentType: null,
  query: null,
  view: null,
} as const;

// Discriminates on `kind`, not field presence: a plugin archive's payload is
// arbitrary.
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
    case "term":
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
    case "entryType":
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
    case "archiveType":
      return {
        ...NO_SUBJECT,
        kind: data.kind,
        page: data.page ?? 1,
        query: data.query ?? null,
      };
    case "view":
      return { ...NO_SUBJECT, kind: data.kind, page: 1, view: data.name };
    case "error":
      return { ...NO_SUBJECT, kind: data.kind, page: 1 };
  }
}
