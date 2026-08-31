type SearchErrorCode = "reindex_insert_returned_no_row";

export class SearchError extends Error {
  static {
    SearchError.prototype.name = "SearchError";
  }

  readonly code: SearchErrorCode;

  private constructor(code: SearchErrorCode, message: string) {
    super(message);
    this.code = code;
  }

  /**
   * The insert that opens a rebuild returned nothing. Not reachable through
   * any input — the row is written and read back in one statement — so this
   * says the database refused a write, which the caller cannot recover from
   * by trying a different rebuild.
   */
  static reindexInsertReturnedNoRow(): SearchError {
    return new SearchError(
      "reindex_insert_returned_no_row",
      "Starting a reindex returned no row.",
    );
  }
}
