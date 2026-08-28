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
  /**
   * 1-based pagination index; 1 on a page that does not paginate.
   *
   * A plugin archive (`CustomArchiveData`) always reports 1, even when it
   * paginates: core does not define that payload's shape, and reading a `page`
   * field off it would be the field-presence guess this record exists to
   * avoid. A plugin that owns such an archive knows its own pagination.
   */
  readonly page: number;
  /** Null on an entry that has never been published, and on every non-entry. */
  readonly published: Date | null;
  readonly modified: Date | null;
  readonly author: ResolvedAuthor | null;
  readonly term: ResolvedTerm | null;
  readonly entry: ResolvedEntry | null;
}

const NO_SUBJECT = {
  published: null,
  modified: null,
  author: null,
  term: null,
  entry: null,
} as const;

/**
 * Read {@link PageFacts} off a render payload.
 *
 * Discriminates on `kind` rather than field presence: a plugin archive's
 * payload is arbitrary, so an `"entry" in data` check would read one plugin's
 * field as core's subject.
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
    case "date":
    case "frontPage":
    case "search":
      return { ...NO_SUBJECT, kind: data.kind, page: data.pagination.page };
    case "custom":
    case "error":
      return { ...NO_SUBJECT, kind: data.kind, page: 1 };
  }
}
