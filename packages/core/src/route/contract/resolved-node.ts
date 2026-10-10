/**
 * The page a request resolved to, as node-hierarchy rules match on it: its
 * kind plus the identity a matcher narrows by.
 */
export type ResolvedNode =
  | ResolvedTermNode
  | ResolvedEntryNode
  | ResolvedEntryTypeArchive
  | ResolvedAuthorNode
  | ResolvedDateNode
  | ResolvedArchiveTypeNode
  | ResolvedViewNode
  | ResolvedFrontPage
  | ResolvedSearch;

interface ResolvedTermNode {
  readonly kind: "term";
  readonly taxonomy: string;
  readonly slug: string;
  readonly databaseId: number;
}

interface ResolvedAuthorNode {
  readonly kind: "author";
  readonly slug: string;
  readonly databaseId: number;
}

interface ResolvedDateNode {
  readonly kind: "date";
  readonly year: number;
  readonly month: number | null;
  readonly day: number | null;
}

interface ResolvedArchiveTypeNode {
  readonly kind: "archiveType";
  readonly name: string;
}

interface ResolvedViewNode {
  readonly kind: "view";
  readonly name: string;
}

interface ResolvedEntryNode {
  readonly kind: "entry";
  readonly entryType: string;
  readonly slug: string;
  readonly databaseId: number;
}

interface ResolvedEntryTypeArchive {
  readonly kind: "entryType";
  readonly entryType: string;
}

interface ResolvedFrontPage {
  readonly kind: "frontPage";
}

interface ResolvedSearch {
  readonly kind: "search";
}
