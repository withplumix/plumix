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
   * Unreachable through input (the row is written and read back in one
   * statement), so the database refused the write.
   */
  static reindexInsertReturnedNoRow(): SearchError {
    return new SearchError(
      "reindex_insert_returned_no_row",
      "Starting a reindex returned no row.",
    );
  }
}
