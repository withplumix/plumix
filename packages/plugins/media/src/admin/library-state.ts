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

export interface AdoptedEtag {
  readonly etag: string;
  /** Every etag this copy's saves were made from. */
  readonly superseded: readonly string[];
}

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

export async function saveFromCopy<Saved extends { readonly etag: string }>(
  adoptedEtags: Map<number, AdoptedEtag>,
  item: { readonly id: number; readonly etag: string },
  save: (ifMatch: string) => Promise<Saved>,
): Promise<Saved> {
  const adopted = adoptedEtags.get(item.id);
  const ifMatch = copyEtag(item.etag, adopted);
  const saved = await save(ifMatch);
  adoptedEtags.set(item.id, adoptEtag(adopted, ifMatch, saved.etag));
  return saved;
}
