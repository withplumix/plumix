import type { InfiniteData } from "@tanstack/react-query";

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

interface SavedMedia {
  readonly id: number;
  readonly alt: string | null;
  readonly etag: string;
}

/** The loaded pages with a saved item's alt and etag in place of its old ones. */
export function withSavedMedia<
  Page extends { readonly items: readonly SavedMedia[] },
>(data: InfiniteData<Page>, saved: SavedMedia): InfiniteData<Page> {
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      items: page.items.map((item) =>
        item.id === saved.id
          ? { ...item, alt: saved.alt, etag: saved.etag }
          : item,
      ),
    })),
  };
}

/**
 * Enter commits and then blurs, which commits the same draft again before a
 * re-render, so a draft that was just saved is not saved twice.
 */
export function altNeedsSave(
  draft: string,
  shown: string,
  lastSaved: string,
): boolean {
  return draft !== shown && draft !== lastSaved;
}

/** An item's alt text as one side of a conflict's comparison. */
export interface AltSnapshot {
  readonly alt: string;
}

/**
 * The saved side of a conflict's comparison: `null` until the list has
 * refetched the version the conflict names.
 */
export function savedAltSnapshot(
  item: { readonly alt: string | null; readonly etag: string },
  conflict: { readonly etag: string },
): AltSnapshot | null {
  if (item.etag !== conflict.etag) return null;
  return { alt: item.alt ?? "" };
}
