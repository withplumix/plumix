import type { Entry } from "../../db/schema/entries.js";
import type { Term } from "../../db/schema/terms.js";

/** Public-safe author projection — query select narrows away email + auth columns. */
export interface ResolvedAuthor {
  readonly id: number;
  readonly name: string | null;
  readonly avatarUrl: string | null;
}

export interface ResolvedEntry extends Entry {
  readonly terms: readonly Term[];
  readonly author: ResolvedAuthor;
}

export interface SingleData {
  readonly entry: ResolvedEntry;
}

export interface Pagination {
  readonly page: number;
  readonly perPage: number;
  readonly total: number;
  readonly pageCount: number;
}

export interface ArchiveData {
  readonly contentType: string;
  readonly entries: readonly ResolvedEntry[];
  readonly pagination: Pagination;
}
