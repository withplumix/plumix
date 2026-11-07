import type { DocumentManifest } from "../document-manifest.js";
import type { EntryQuery } from "../entries/contract/query.js";
import type { EntryArchive } from "../route/contract/intent.js";
import type {
  AuthorArchiveData,
  DateArchiveData,
  EntryData,
  EntryTypeArchiveData,
  FrontPageData,
  SearchData,
  TermArchiveData,
} from "../route/contract/resolved-entry.js";
import type { TemplateData } from "../theme.js";
import { defineFilter } from "./define.js";

export interface RenderDocumentInput {
  readonly data: TemplateData;
  readonly title: string;
}

export interface ArchiveEntriesInput {
  readonly archive: EntryArchive;
  readonly params: Readonly<Record<string, string>>;
}

/** Core's filters about rendering a page. */
export const render = {
  /**
   * The assembled document, so theme tags are already present. Also runs on
   * an error render (`data.kind === "error"`), where a throw is logged and the
   * page renders its unfiltered document.
   */
  document: defineFilter<DocumentManifest, RenderDocumentInput>(
    "render:document",
    { sync: false },
  ),
  /** A single entry's data, before its template renders. */
  single: defineFilter<EntryData>("render:single", { sync: false }),
  /** An entry type's archive data, before its template renders. */
  archive: defineFilter<EntryTypeArchiveData>("render:archive", {
    sync: false,
  }),
  /** A term archive's data, before its template renders. */
  term: defineFilter<TermArchiveData>("render:term", { sync: false }),
  /** An author archive's data, before its template renders. */
  author: defineFilter<AuthorArchiveData>("render:author", { sync: false }),
  /** A date archive's data, before its template renders. */
  date: defineFilter<DateArchiveData>("render:date", { sync: false }),
  /** The front page's data, before its template renders. */
  frontPage: defineFilter<FrontPageData>("render:frontPage", { sync: false }),
  /** The search page's data, before its template renders. */
  search: defineFilter<SearchData>("render:search", { sync: false }),
  /**
   * Narrows an archive's entry query wherever it is read. The public-entries
   * rule reapplies, so a handler can hide an entry but never reveal one.
   */
  archiveEntries: defineFilter<EntryQuery, ArchiveEntriesInput>(
    "render:archiveEntries",
    { sync: true },
  ),
};
