export class RevisionRepositoryError extends Error {
  static {
    RevisionRepositoryError.prototype.name = "RevisionRepositoryError";
  }

  readonly code: "insert_returned_no_row";

  private constructor(code: "insert_returned_no_row", message: string) {
    super(message);
    this.code = code;
  }

  static insertReturnedNoRow(): RevisionRepositoryError {
    return new RevisionRepositoryError(
      "insert_returned_no_row",
      "snapshotAsRevision: insert into entries returned no row — driver likely rejected the row but did not raise.",
    );
  }
}
