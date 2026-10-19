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

/** A save's answer, kept until the list catches up with it. */
export interface AdoptedEtag {
  readonly etag: string;
  /** Every etag this copy's saves were made from. */
  readonly superseded: readonly string[];
}

/** Records that a save sent `ifMatch` and was answered with `etag`. */
export function adoptEtag(
  previous: AdoptedEtag | undefined,
  ifMatch: string,
  etag: string,
): AdoptedEtag {
  return { etag, superseded: [...(previous?.superseded ?? []), ifMatch] };
}

/**
 * The `ifMatch` the drawer's next save sends. Etags are opaque, so the list
 * wins as soon as it shows one no save of this copy was made from.
 */
export function copyEtag(
  listed: string,
  adopted: AdoptedEtag | undefined,
): string {
  return adopted?.superseded.includes(listed) ? adopted.etag : listed;
}
