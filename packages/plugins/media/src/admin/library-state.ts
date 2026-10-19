/** What the empty library shows when no search narrows it. */
type LibraryEmptyState = "dropzone" | "storage-required";

export interface LibraryUploadState {
  readonly offerUpload: boolean;
  readonly acceptDrops: boolean;
  readonly emptyState: LibraryEmptyState;
}

/**
 * Without a storage adapter every upload fails, so no gesture may start one
 * (ADR 0014).
 */
export function libraryUploadState(
  storageConfigured: boolean,
): LibraryUploadState {
  return {
    offerUpload: storageConfigured,
    acceptDrops: storageConfigured,
    emptyState: storageConfigured ? "dropzone" : "storage-required",
  };
}
