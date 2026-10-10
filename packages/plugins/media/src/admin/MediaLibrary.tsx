import type { PluginRpcOutputs } from "plumix/admin";
import type { MessageDescriptor } from "plumix/i18n";
import type { CSSProperties, DragEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { basePath, describeRpcError, isSlotConfigured } from "plumix/admin";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Skeleton,
} from "plumix/admin/ui";
import { Trans, useLingui } from "plumix/i18n";

import type { MediaRouter } from "../rpc.js";
import { mediaRpc } from "./rpc.js";

// Descriptors that need runtime indirection — used outside JSX (aria
// strings, native attribute values). JSX-text strings stay inline at
// their `<Trans>` callsite for extraction discoverability.
const M = {
  titleLibrary: {
    id: "plugin.media.library.title.library",
    message: "Media Library",
  },
  titlePicker: {
    id: "plugin.media.library.title.picker",
    message: "Select media",
  },
  pickItemAria: {
    id: "plugin.media.library.pickItemAria",
    message: "Pick {title}",
    comment: "title: the media item's display title",
  },
  openDetailsAria: {
    id: "plugin.media.library.openDetailsAria",
    message: "Open details for {title}",
    comment: "title: the media item's display title",
  },
  closeDetailsAria: {
    id: "plugin.media.detail.closeAria",
    message: "Close details",
  },
  describeImage: {
    id: "plugin.media.detail.altPlaceholderImage",
    message: "Describe this image…",
  },
  describeAsset: {
    id: "plugin.media.detail.altPlaceholderOther",
    message: "Add a description…",
  },
  confirmDeleteDescription: {
    id: "plugin.media.detail.deleteDescription",
    message:
      '"{title}" will be removed permanently. Pages or posts that embed it will show a broken link.',
    comment: "title: the media item being deleted",
  },
  uploadingFiles: {
    id: "plugin.media.upload.progress",
    message: "Uploading {count, plural, one {# file} other {# files}}…",
    comment: "count: number of files currently uploading",
  },
  searchPlaceholder: {
    id: "plugin.media.library.searchPlaceholder",
    message: "Search by filename…",
  },
} satisfies Record<string, MessageDescriptor>;

const PAGE_SIZE = 24;
const UPLOAD_CONCURRENCY = 4;

// `MEDIA_LIST_KEY` is parametric over `accept` so the picker grid
// stays in its own cache slot — the page-mode library and a picker
// scoped to `accept: "image/"` never poison each other's data.
function mediaListKey(
  accept: string | readonly string[] | undefined,
  search: string,
): readonly unknown[] {
  return ["media", "list", accept ?? null, search] as const;
}

// Matches the admin's DebouncedSearchInput interval for list-screen parity.
const SEARCH_DEBOUNCE_MS = 250;

// Local debounce — the admin shell's DebouncedSearchInput lives behind
// the `@/` alias and isn't part of the plugin-facing surface.
function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [value, delayMs]);
  return debounced;
}

// Without `publicUrlBase` the plugin emits relative serve URLs, which break
// once pasted elsewhere; `Copy URL` must hand back something pasteable.
function toAbsoluteUrl(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  if (typeof window === "undefined") return url;
  try {
    return new URL(url, window.location.origin).toString();
  } catch {
    return url;
  }
}

async function runWithConcurrency<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const next = async (): Promise<void> => {
    const i = cursor++;
    if (i >= items.length) return;
    const item = items[i];
    if (item !== undefined) await worker(item);
    return next();
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => next()),
  );
}

type MediaItem = PluginRpcOutputs<MediaRouter>["list"]["items"][number];

/**
 * Carries the resolved url/alt, not just the id, so a consumer can snapshot
 * them without a second round-trip.
 */
export type MediaSelection = Readonly<{
  id: string;
  url: string;
  alt: string | null;
  mime: string;
  filename: string;
  width: number | null;
  height: number | null;
}>;

function toSelection(item: MediaItem): MediaSelection {
  return {
    id: String(item.id),
    url: item.url,
    alt: item.alt,
    mime: item.mime,
    filename: item.title,
    width: item.width,
    height: item.height,
  };
}

// The PUT never reaches oRPC, so the HTTP status stands in for a `reason`;
// null when the request never got an answer.
class UploadPutError extends Error {
  static {
    UploadPutError.prototype.name = "UploadPutError";
  }

  readonly status: number | null;

  private constructor(status: number | null, message: string) {
    super(message);
    this.status = status;
  }

  static rejected(status: number): UploadPutError {
    return new UploadPutError(status, `upload PUT answered ${String(status)}`);
  }

  static unreachable(): UploadPutError {
    return new UploadPutError(null, "upload PUT got no response");
  }
}

// Browser PUT with progress reporting. `fetch()` in 2026 still doesn't
// expose request-body progress; XMLHttpRequest's `upload.onprogress` is
// the only portable signal. The signed headers must be echoed verbatim.
function putWithProgress(
  url: string,
  method: string,
  headers: Record<string, string>,
  body: File,
  onProgress: (loaded: number, total: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    for (const [name, value] of Object.entries(headers)) {
      xhr.setRequestHeader(name, value);
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(UploadPutError.rejected(xhr.status));
    };
    xhr.onerror = () => reject(UploadPutError.unreachable());
    xhr.send(body);
  });
}

interface PendingUpload {
  readonly id: string;
  readonly name: string;
  readonly progress: number; // 0..1
}

interface MediaUploadState {
  readonly pending: readonly PendingUpload[];
  readonly error: MessageDescriptor | null;
  readonly setError: (error: MessageDescriptor | null) => void;
  readonly startUpload: (files: readonly File[]) => Promise<void>;
}

function useMediaUpload(invalidateList: () => void): MediaUploadState {
  const [pending, setPending] = useState<readonly PendingUpload[]>([]);
  const [error, setError] = useState<MessageDescriptor | null>(null);

  const uploadOne = useCallback(async (file: File): Promise<void> => {
    const slot: PendingUpload = {
      id: crypto.randomUUID(),
      name: file.name,
      progress: 0,
    };
    setPending((prev) => [...prev, slot]);
    try {
      const init = await mediaRpc.createUploadUrl({
        filename: file.name,
        contentType: file.type,
        size: file.size,
      });
      try {
        // Same-origin worker route needs the CSRF header that the
        // dispatcher enforces on `/_plumix/*`. R2 (cross-origin) must
        // NOT receive it — extra headers would break SigV4.
        const headers = init.uploadUrl.startsWith("/")
          ? { ...init.headers, "x-plumix-request": "1" }
          : init.headers;
        await putWithProgress(
          init.uploadUrl,
          init.method,
          headers,
          file,
          (loaded, total) => {
            setPending((prev) =>
              prev.map((p) =>
                p.id === slot.id ? { ...p, progress: loaded / total } : p,
              ),
            );
          },
        );
        await mediaRpc.confirm({ id: init.mediaId });
      } catch (error) {
        await tryCleanupDraft(init.mediaId);
        throw error;
      }
    } catch (error) {
      setError(uploadErrorLabel(error));
    } finally {
      setPending((prev) => prev.filter((p) => p.id !== slot.id));
    }
  }, []);

  const startUpload = useCallback(
    async (files: readonly File[]): Promise<void> => {
      if (files.length === 0) return;
      // Cap parallelism so a 50-file drop doesn't fire 50 simultaneous
      // RPCs / XHRs. Browsers throttle to ~6 connections per origin
      // anyway; pulling work off a small pool gives proper backpressure.
      await runWithConcurrency(files, UPLOAD_CONCURRENCY, uploadOne);
      invalidateList();
    },
    [uploadOne, invalidateList],
  );

  return { pending, error, setError, startUpload };
}

// Generic intersection-observer-on-sentinel hook. Re-binds when the
// data length changes so we don't miss the next intersection after a
// page lands.
function useInfiniteScrollSentinel(
  sentinelRef: React.RefObject<HTMLDivElement | null>,
  hasNextPage: boolean,
  isFetchingNextPage: boolean,
  fetchNextPage: () => Promise<unknown> | void,
  dataLength: number | undefined,
): void {
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !isFetchingNextPage) {
        // The callback may be async (e.g. React Query's fetchNextPage)
        // — discard the promise so eslint's no-misused-promises stays
        // happy and we don't accidentally await inside the observer.
        void fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [sentinelRef, hasNextPage, isFetchingNextPage, fetchNextPage, dataLength]);
}

/**
 * Picker mode swaps the detail drawer for a "Use selection" footer; a card
 * click selects, a double click confirms.
 */
export interface MediaLibraryProps {
  readonly mode?: "page" | "picker";
  /**
   * Server-side MIME filter forwarded to `media.list`. String form is
   * a prefix match (`"image/"` → every `image/*` MIME); array form is
   * an exact whitelist. Picker-mode only — page mode ignores it.
   */
  readonly accept?: string | readonly string[];
  /** Picker-mode only. Single-pick; the caller closes the modal. */
  readonly onSelect?: (selection: MediaSelection) => void;
  /** Picker-mode only: called when the user clicks Cancel. */
  readonly onCancel?: () => void;
}

export function MediaLibrary({
  mode = "page",
  accept,
  onSelect,
  onCancel,
}: MediaLibraryProps = {}): ReactNode {
  const queryClient = useQueryClient();
  const { i18n } = useLingui();
  const [dragging, setDragging] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const isPicker = mode === "picker";
  // Without a storage adapter every upload fails, so no gesture may start one
  // (ADR 0014).
  const canUpload = isSlotConfigured("storage");

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search.trim(), SEARCH_DEBOUNCE_MS);

  const queryKey = mediaListKey(accept, debouncedSearch);
  const list = useInfiniteQuery({
    queryKey,
    initialPageParam: 0,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      mediaRpc.list({
        limit: PAGE_SIZE,
        offset: pageParam,
        // `accept` only flows through in picker mode. Page mode shows
        // the full library regardless.
        // The wire schema types its arrays mutable; the prop keeps them
        // readonly.
        ...(isPicker && accept !== undefined
          ? { accept: typeof accept === "string" ? accept : [...accept] }
          : {}),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      }),
    getNextPageParam: (last, allPages) =>
      last.hasMore ? allPages.length * PAGE_SIZE : undefined,
  });

  const items = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data?.pages],
  );

  const invalidateList = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey });
  }, [queryClient, queryKey]);

  // Pass the stable callback unwrapped, or the observer is rebuilt every
  // render.
  useInfiniteScrollSentinel(
    sentinelRef,
    list.hasNextPage,
    list.isFetchingNextPage,
    list.fetchNextPage,
    list.data?.pages.length,
  );

  const { pending, error, setError, startUpload } =
    useMediaUpload(invalidateList);

  const remove = useMutation({
    mutationFn: (id: number) => mediaRpc.delete({ id }),
    onSuccess: invalidateList,
    onError: (failure) => setError(uploadErrorLabel(failure)),
  });

  const update = useMutation({
    mutationFn: (input: { id: number; alt: string }) => mediaRpc.update(input),
    onSuccess: invalidateList,
    onError: (failure) => setError(uploadErrorLabel(failure)),
  });

  // On the root, not the grid: the grid only renders when items exist, so the
  // empty state would reject drops.
  const dropProps = {
    onDragOver: (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: DragEvent) => {
      // `dragleave` fires on every child boundary cross — ignore unless
      // the cursor actually left the root container.
      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
      setDragging(false);
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const files = Array.from(e.dataTransfer.files);
      void startUpload(files);
    },
  };

  // Mirrored in state, not derived from `items`, so the drawer survives a row
  // briefly leaving the list during a refetch. Only a settled list without the
  // row closes it.
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  useEffect(() => {
    if (selectedItem === null) return;
    const fresh = items.find((it) => it.id === selectedItem.id);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mirroring is intentional; see block comment above.
    if (fresh && fresh !== selectedItem) setSelectedItem(fresh);
    // If the row was deleted (not in items AND list is settled), close.
    if (!fresh && list.status === "success" && !list.isFetching) {
      setSelectedItem(null);
    }
  }, [items, list.status, list.isFetching, selectedItem]);

  // The whole item, not its id: the footer confirm must resolve a selection
  // even after a search or scroll evicts it from the loaded page.
  const [pickerSelected, setPickerSelected] = useState<MediaItem | null>(null);
  const handleCardActivate = useCallback(
    (item: MediaItem): void => {
      if (isPicker) {
        setPickerSelected(item);
        return;
      }
      setSelectedItem(item);
    },
    [isPicker],
  );
  const handleCardConfirm = useCallback(
    (item: MediaItem): void => {
      if (!isPicker) return;
      onSelect?.(toSelection(item));
    },
    [isPicker, onSelect],
  );

  // ESC closes the detail drawer. Depend on the boolean `open` flag
  // (primitive) so the listener doesn't tear down/rebind on every
  // refresh of `selectedItem`.
  const drawerOpen = selectedItem !== null;
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setSelectedItem(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  return (
    <div
      data-testid="media-library"
      data-mode={mode}
      className="relative flex min-h-full gap-6"
      {...(canUpload ? dropProps : {})}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1
            data-testid="media-library-title"
            className={`${isPicker ? "text-xl" : "text-2xl"} font-semibold`}
          >
            {isPicker ? i18n._(M.titlePicker) : i18n._(M.titleLibrary)}
          </h1>
          <div className="flex items-center gap-2">
            <Input
              type="search"
              role="searchbox"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              placeholder={i18n._(M.searchPlaceholder)}
              // Placeholder is not an accessible name (it clears on
              // input); name the field explicitly. maxLength mirrors the
              // server's 200-char cap on media.list's search input.
              aria-label={i18n._(M.searchPlaceholder)}
              maxLength={200}
              data-testid="media-library-search"
              className="w-56"
            />
            {canUpload && (
              <UploadButton onSelect={(files) => void startUpload(files)} />
            )}
          </div>
        </header>

        {pending.length > 0 && <UploadProgressBar pending={pending} />}

        {list.status === "pending" && <MediaSkeletonGrid />}
        {list.status === "error" && (
          <div
            role="alert"
            data-testid="media-library-error"
            className="text-destructive text-sm"
          >
            <Trans
              id="plugin.media.library.failedToLoad"
              message="Failed to load media."
            />
          </div>
        )}

        {list.status === "success" &&
          items.length === 0 &&
          (debouncedSearch ? (
            // A no-match search must not show the "library is empty"
            // dropzone — the library isn't empty, the filter is.
            <p
              data-testid="media-library-no-matches"
              className="text-muted-foreground text-sm"
            >
              <Trans
                id="plugin.media.library.noMatches"
                message="No files match your search."
              />
            </p>
          ) : canUpload ? (
            <Dropzone
              onSelect={(files) => void startUpload(files)}
              highlight={dragging}
            />
          ) : (
            <p
              data-testid="media-library-storage-required"
              className="text-muted-foreground text-sm"
            >
              <Trans
                id="plugin.media.library.storageRequired"
                message="Uploads need a storage adapter — set `storage:` in plumix.config.ts."
              />
            </p>
          ))}

        {list.status === "success" && items.length > 0 && (
          <div
            data-testid="media-library-grid"
            className="grid-cols-media grid gap-4"
          >
            {items.map((item) => {
              const selected = isPicker
                ? pickerSelected?.id === item.id
                : selectedItem?.id === item.id;
              return (
                <MediaCard
                  key={item.id}
                  item={item}
                  selected={selected}
                  onActivate={() => handleCardActivate(item)}
                  // Page mode: double-click is idempotent with single-
                  // click (open detail). Picker mode: confirm + close.
                  onConfirm={
                    isPicker
                      ? () => handleCardConfirm(item)
                      : () => handleCardActivate(item)
                  }
                  ariaActionLabel={
                    isPicker
                      ? i18n._(
                          M.pickItemAria.id,
                          { title: item.title },
                          { message: M.pickItemAria.message },
                        )
                      : i18n._(
                          M.openDetailsAria.id,
                          { title: item.title },
                          { message: M.openDetailsAria.message },
                        )
                  }
                />
              );
            })}
          </div>
        )}

        <div ref={sentinelRef} data-testid="media-library-sentinel" />

        {list.isFetchingNextPage && (
          <div
            data-testid="media-library-loading-more"
            className="text-muted-foreground text-center text-sm"
          >
            <Trans
              id="plugin.media.library.loadingMore"
              message="Loading more…"
            />
          </div>
        )}

        {/* Page-wide drop overlay — visible whenever a drag is active and
            the populated grid is rendered (the empty state has its own
            built-in highlight via the Dropzone component). */}
        {dragging && items.length > 0 && (
          <div
            data-testid="media-library-drop-overlay"
            aria-hidden="true"
            className="border-primary pointer-events-none absolute inset-4 rounded-lg border-2 border-dashed bg-white/5"
          />
        )}

        {isPicker && (
          <footer
            data-testid="media-library-picker-footer"
            className="bg-background sticky bottom-0 -mx-2 flex items-center justify-end gap-2 border-t px-2 py-3"
          >
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onCancel?.()}
              data-testid="media-library-picker-cancel"
            >
              <Trans id="plugin.media.library.pickerCancel" message="Cancel" />
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={pickerSelected === null}
              onClick={() => {
                if (pickerSelected) onSelect?.(toSelection(pickerSelected));
              }}
              data-testid="media-library-picker-confirm"
            >
              <Trans
                id="plugin.media.library.pickerUseSelection"
                message="Use selection"
              />
            </Button>
          </footer>
        )}
      </div>

      {!isPicker && selectedItem && (
        <MediaDetailDrawer
          item={selectedItem}
          onClose={() => setSelectedItem(null)}
          onAltChange={(alt) => update.mutate({ id: selectedItem.id, alt })}
          onDelete={() => {
            // Confirmation handled inside the drawer's ConfirmDialog;
            // by the time we get here the user already confirmed.
            const id = selectedItem.id;
            setSelectedItem(null);
            remove.mutate(id);
          }}
        />
      )}

      {error && (
        <ErrorBanner
          testIdRoot="media-library-banner-error"
          message={i18n._(error)}
          onDismiss={() => setError(null)}
        />
      )}
    </div>
  );
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

// The banner is the only surface a failed upload shows, and raw reasons like
// `mime_mismatch` read like 404s. Aliased codes share one descriptor.
const ERROR_DESCRIPTORS = {
  storageNotConfigured: {
    id: "plugin.media.error.storageNotConfigured",
    message:
      "No storage adapter is wired up — set `storage:` in plumix.config.ts.",
  },
  payloadTooLarge: {
    id: "plugin.media.error.payloadTooLarge",
    message: "File exceeds the configured maxUploadSize.",
  },
  unsupportedMediaType: {
    id: "plugin.media.error.unsupportedMediaType",
    message:
      "This file type isn't allowed by the media plugin's acceptedTypes.",
  },
  mimeMismatch: {
    id: "plugin.media.error.mimeMismatch",
    message: "The uploaded bytes don't match the declared file type.",
  },
  objectNotFound: {
    id: "plugin.media.error.objectNotFound",
    message: "Upload didn't reach storage — check your bucket's CORS rules.",
  },
  alreadyConfirmed: {
    id: "plugin.media.error.alreadyConfirmed",
    message: "This upload was already confirmed by another tab or device.",
  },
  serverCouldntProcess: {
    id: "plugin.media.error.serverCouldntProcess",
    message: "Server couldn't process this upload. Try again.",
  },
  contentLengthRequired: {
    id: "plugin.media.error.contentLengthRequired",
    message:
      "Upload missing Content-Length — your browser/proxy may be using chunked transfer.",
  },
  csrfTokenMissing: {
    id: "plugin.media.error.csrfTokenMissing",
    message: "Request blocked by CSRF check. Reload the page and try again.",
  },
  generic: {
    id: "plugin.media.error.generic",
    message: "Something went wrong. Try again.",
  },
} satisfies Record<string, MessageDescriptor>;

const REASON_ERRORS: Readonly<Record<string, MessageDescriptor>> = {
  storage_not_configured: ERROR_DESCRIPTORS.storageNotConfigured,
  payload_too_large: ERROR_DESCRIPTORS.payloadTooLarge,
  unsupported_media_type: ERROR_DESCRIPTORS.unsupportedMediaType,
  content_type_mismatch: ERROR_DESCRIPTORS.unsupportedMediaType,
  mime_mismatch: ERROR_DESCRIPTORS.mimeMismatch,
  object_not_found: ERROR_DESCRIPTORS.objectNotFound,
  already_confirmed: ERROR_DESCRIPTORS.alreadyConfirmed,
  media_meta_invalid: ERROR_DESCRIPTORS.serverCouldntProcess,
  db_insert_failed: ERROR_DESCRIPTORS.serverCouldntProcess,
  storage_put_failed: ERROR_DESCRIPTORS.serverCouldntProcess,
  content_length_required: ERROR_DESCRIPTORS.contentLengthRequired,
  csrf_token_missing: ERROR_DESCRIPTORS.csrfTokenMissing,
};

const PUT_STATUS_ERRORS: Readonly<Record<number, MessageDescriptor>> = {
  411: ERROR_DESCRIPTORS.contentLengthRequired,
  413: ERROR_DESCRIPTORS.payloadTooLarge,
  415: ERROR_DESCRIPTORS.unsupportedMediaType,
};

function uploadErrorLabel(error: unknown): MessageDescriptor {
  if (error instanceof UploadPutError && error.status !== null) {
    const byStatus = PUT_STATUS_ERRORS[error.status];
    if (byStatus) return byStatus;
  }
  return describeRpcError(error, REASON_ERRORS, ERROR_DESCRIPTORS.generic);
}

function ErrorBanner({
  testIdRoot,
  message,
  onDismiss,
}: {
  testIdRoot: string;
  message: string;
  onDismiss: () => void;
}): ReactNode {
  return (
    <div
      role="alert"
      data-testid={testIdRoot}
      className="text-destructive flex items-center justify-between gap-3 text-sm"
    >
      <span>{message}</span>
      <Button
        type="button"
        variant="destructive-ghost"
        size="xs"
        data-testid={`${testIdRoot}-dismiss`}
        onClick={onDismiss}
      >
        <Trans id="plugin.media.banner.dismiss" message="Dismiss" />
      </Button>
    </div>
  );
}

async function tryCleanupDraft(mediaId: number): Promise<void> {
  try {
    await mediaRpc.delete({ id: mediaId });
  } catch {
    // Best-effort — server-side draft GC will catch it.
  }
}

// The page-wide drop handlers already accept files; a visible target tells the
// user the empty library accepts them at all.
function Dropzone({
  onSelect,
  highlight,
}: {
  onSelect: (files: readonly File[]) => void;
  highlight: boolean;
}): ReactNode {
  return (
    <label
      data-testid="media-library-dropzone"
      data-active={highlight ? "true" : undefined}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-16 text-center transition-colors duration-150 ${
        highlight ? "border-primary bg-white/5" : "border-border bg-transparent"
      }`}
    >
      <input
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onSelect(files);
          event.target.value = "";
        }}
      />
      <CloudUploadGlyph />
      <div className="flex flex-col gap-1">
        <p className="m-0 text-sm font-medium">
          <Trans
            id="plugin.media.dropzone.headline"
            message="Your library is empty. Add files to get started."
          />
        </p>
        <p className="text-muted-foreground m-0 text-xs">
          <Trans
            id="plugin.media.dropzone.subline"
            message="Drag and drop or <0>select from computer</0>"
            components={{
              0: <span className="underline" />,
            }}
          />
        </p>
      </div>
    </label>
  );
}

function CloudUploadGlyph(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-muted-foreground size-12"
    >
      <path d="M16 16l-4-4-4 4" />
      <path d="M12 12v9" />
      <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
    </svg>
  );
}

function UploadButton({
  onSelect,
}: {
  onSelect: (files: readonly File[]) => void;
}): ReactNode {
  return (
    <label
      data-testid="media-library-upload"
      className="bg-card hover:bg-muted cursor-pointer rounded border px-4 py-2 text-sm"
    >
      <input
        type="file"
        multiple
        className="sr-only"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onSelect(files);
          event.target.value = "";
        }}
      />
      <Trans id="plugin.media.upload.button" message="Upload" />
    </label>
  );
}

function UploadProgressBar({
  pending,
}: {
  pending: readonly PendingUpload[];
}): ReactNode {
  const total = pending.reduce((sum, p) => sum + p.progress, 0);
  const ratio = total / pending.length;
  const pct = Math.round(ratio * 100);
  return (
    <div
      data-testid="media-library-progress"
      className="border-border bg-card flex flex-col gap-1.5 rounded-md border px-4 py-3 text-xs"
    >
      <div className="flex items-center justify-between">
        <span>
          <Trans
            id="plugin.media.upload.progress"
            message="Uploading {count, plural, one {# file} other {# files}}…"
            values={{ count: pending.length }}
            comment="count: number of files currently uploading"
          />
        </span>
        <span data-testid="media-library-progress-pct">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-white/10">
        <div
          className="bg-primary transition-width h-full w-(--progress) duration-200 ease-in-out"
          style={{ "--progress": `${String(pct)}%` } as CSSProperties}
        />
      </div>
    </div>
  );
}

function MediaCard({
  item,
  selected,
  onActivate,
  onConfirm,
  ariaActionLabel,
}: {
  item: MediaItem;
  selected: boolean;
  // Single-click action — opens the drawer (page mode) OR sets the
  // picker selection (picker mode).
  onActivate: () => void;
  // Double-click action — only meaningful in picker mode (confirm +
  // close). Page mode passes an empty fn.
  onConfirm?: () => void;
  ariaActionLabel: string;
  // onDelete + onAltChange removed from card — both belong to the
  // detail drawer now (matches the WP/screenshot pattern: card is
  // the index, drawer is the detail editor).
}): ReactNode {
  const { i18n } = useLingui();
  const isImage = item.mime.startsWith("image/");

  return (
    <article
      data-testid={`media-card-${String(item.id)}`}
      data-selected={selected ? "true" : undefined}
      className={`border-border bg-card relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 ${
        selected ? "outline-primary outline-2 outline-offset-1" : ""
      }`}
      onClick={onActivate}
      onDoubleClick={onConfirm}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onActivate();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={ariaActionLabel}
    >
      <div className="bg-muted relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-sm">
        {isImage ? (
          <ImageWithFallback
            src={item.thumbnailUrl}
            alt={item.alt ?? item.title}
            mime={item.mime}
            testId={`media-card-${String(item.id)}-thumb`}
          />
        ) : (
          <FileGlyph mime={item.mime} />
        )}
        <FileTypeBadge mime={item.mime} />
      </div>
      <div
        data-testid={`media-card-${String(item.id)}-title`}
        className="truncate text-sm"
        title={item.title}
      >
        {item.title}
      </div>
      <div className="flex gap-2 text-xs opacity-60">
        <span>{formatShortDate(i18n.locale, item.uploadedAt)}</span>
        <span>·</span>
        <span>{formatSize(i18n.locale, item.size)}</span>
      </div>
    </article>
  );
}

function MediaSkeletonGrid(): ReactNode {
  // Same grid shape as the populated state so the layout is stable
  // across the loading → loaded transition (no shift, no reflow).
  const placeholders = Array.from({ length: 8 }, (_, i) => i);
  return (
    <div
      data-testid="media-library-loading"
      className="grid-cols-media grid gap-4"
    >
      {placeholders.map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
        >
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-3.5 w-7/10" />
          <Skeleton className="h-3 w-2/5" />
        </div>
      ))}
    </div>
  );
}

function FileTypeBadge({ mime }: { mime: string }): ReactNode {
  const label = badgeLabel(mime);
  if (!label) return null;
  return (
    <span className="absolute end-2 top-2 rounded-sm bg-black/75 px-1.5 py-0.5 text-xs font-semibold tracking-wider text-white">
      {label}
    </span>
  );
}

const EXACT_BADGE_LABELS: Readonly<Record<string, string>> = {
  "application/pdf": "PDF",
  "application/msword": "DOC",
  "application/vnd.ms-excel": "XLS",
  "application/vnd.ms-powerpoint": "PPT",
  "application/zip": "ZIP",
};

const SUBSTRING_BADGE_LABELS: readonly (readonly [string, string])[] = [
  ["wordprocessingml", "DOCX"],
  ["spreadsheetml", "XLSX"],
  ["presentationml", "PPTX"],
];

function badgeLabel(mime: string): string | null {
  const exact = EXACT_BADGE_LABELS[mime];
  if (exact) return exact;
  const sub = SUBSTRING_BADGE_LABELS.find(([needle]) => mime.includes(needle));
  if (sub) return sub[1];
  const tail = mime.split("/")[1] ?? "";
  return tail.replace(/^x-/, "").toUpperCase().slice(0, 5);
}

function formatShortDate(locale: string, iso: string): string {
  // The UI locale, not the browser's, so dates match the chrome. No
  // `.toUpperCase()`: it breaks Turkish dotless-i; CSS sets small-caps.
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  }).format(d);
}

function formatLongDate(locale: string, iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

function MediaDetailDrawer({
  item,
  onClose,
  onAltChange,
  onDelete,
}: {
  item: MediaItem;
  onClose: () => void;
  onAltChange: (alt: string) => void;
  onDelete: () => void;
}): ReactNode {
  const { i18n } = useLingui();
  const [copied, setCopied] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const isImage = item.mime.startsWith("image/");
  const absoluteUrl = toAbsoluteUrl(item.url);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* user can copy from the visible URL */
    }
  }, [absoluteUrl]);

  return (
    <aside
      data-testid="media-detail-drawer"
      className="border-border bg-card max-h-sticky-panel sticky top-8 flex w-80 flex-shrink-0 flex-col self-start overflow-y-auto rounded-lg border"
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <span className="text-xs tracking-wider opacity-70">
          <Trans id="plugin.media.detail.heading" message="ASSET DETAILS" />
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          aria-label={i18n._(M.closeDetailsAria)}
          data-testid="media-detail-close"
        >
          <span aria-hidden="true" className="text-base leading-none">
            ×
          </span>
        </Button>
      </div>

      <div className="bg-muted aspect-square w-full overflow-hidden">
        {isImage ? (
          <img
            src={item.thumbnailUrl}
            alt={item.alt ?? item.title}
            className="size-full object-contain"
          />
        ) : (
          <FileGlyph mime={item.mime} />
        )}
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <h2 className="m-0 text-base font-semibold break-all">
            {item.title}
          </h2>
        </div>

        <DetailField
          label={
            <Trans
              id="plugin.media.detail.field.assetType"
              message="ASSET TYPE"
            />
          }
          value={item.mime}
        />
        <DetailField
          label={
            <Trans
              id="plugin.media.detail.field.fileSize"
              message="FILE SIZE"
            />
          }
          value={formatSize(i18n.locale, item.size)}
        />
        <DetailField
          label={
            <Trans id="plugin.media.detail.field.uploaded" message="UPLOADED" />
          }
          value={formatLongDate(i18n.locale, item.uploadedAt)}
        />

        <div>
          <DetailLabel>
            <Trans id="plugin.media.detail.field.altText" message="ALT TEXT" />
          </DetailLabel>
          <AltEditor
            cardId={item.id}
            testIdPrefix="media-detail"
            value={item.alt ?? ""}
            placeholder={
              isImage ? i18n._(M.describeImage) : i18n._(M.describeAsset)
            }
            onSave={onAltChange}
          />
        </div>

        <div>
          <DetailLabel>
            <Trans id="plugin.media.detail.field.url" message="URL" />
          </DetailLabel>
          <div className="flex items-center gap-2">
            <code
              data-testid="media-detail-url"
              className="flex-1 truncate text-xs break-all opacity-85"
              title={absoluteUrl}
            >
              {absoluteUrl}
            </code>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={() => void copy()}
              data-testid="media-detail-copy"
              className="flex-shrink-0"
            >
              {copied ? (
                <Trans id="plugin.media.detail.copied" message="Copied" />
              ) : (
                <Trans id="plugin.media.detail.copy" message="Copy" />
              )}
            </Button>
          </div>
        </div>

        <div className="border-border flex gap-2 border-t pt-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <a
              // Via the serve route: `download` is ignored cross-origin (with
              // `publicUrlBase`), but `?attachment=1` forces the disposition.
              href={`${basePath()}/_plumix/media/serve/${String(item.id)}?attachment=1`}
              download={item.title}
              data-testid="media-detail-download"
            >
              <Trans id="plugin.media.detail.download" message="Download" />
            </a>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid="media-detail-delete"
            onClick={() => setConfirmingDelete(true)}
            className="flex-1"
          >
            <Trans id="plugin.media.detail.delete" message="Delete" />
          </Button>
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          title={
            <Trans
              id="plugin.media.detail.deleteTitle"
              message="Delete this asset?"
            />
          }
          description={i18n._(
            M.confirmDeleteDescription.id,
            { title: item.title },
            { message: M.confirmDeleteDescription.message },
          )}
          confirmLabel={
            <Trans id="plugin.media.detail.deleteConfirm" message="Delete" />
          }
          danger
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => {
            setConfirmingDelete(false);
            onDelete();
          }}
        />
      )}
    </aside>
  );
}

function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: ReactNode;
  description?: string;
  confirmLabel?: ReactNode;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactNode {
  // Mounted only while confirming, so it is always open; every close routes
  // through `onOpenChange` → `onCancel`.
  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next) onCancel();
      }}
    >
      <AlertDialogContent data-testid="confirm-dialog-overlay">
        <AlertDialogHeader>
          <AlertDialogTitle data-testid="confirm-dialog-title">
            {title}
          </AlertDialogTitle>
          {description ? (
            <AlertDialogDescription>{description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel data-testid="confirm-dialog-cancel">
            <Trans id="plugin.media.dialog.cancel" message="Cancel" />
          </AlertDialogCancel>
          <AlertDialogAction
            data-testid="confirm-dialog-confirm"
            variant={danger ? "destructive" : "default"}
            onClick={onConfirm}
          >
            {confirmLabel ?? (
              <Trans id="plugin.media.dialog.confirm" message="Confirm" />
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DetailLabel({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mb-1 text-xs tracking-wider opacity-60">{children}</div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: ReactNode;
  value: string;
}): ReactNode {
  return (
    <div>
      <DetailLabel>{label}</DetailLabel>
      <div className="text-sm break-words">{value}</div>
    </div>
  );
}

function AltEditor({
  cardId,
  testIdPrefix = "media-card",
  value,
  placeholder,
  onSave,
}: {
  cardId: number;
  testIdPrefix?: string;
  value: string;
  placeholder: string;
  onSave: (alt: string) => void;
}): ReactNode {
  const [draft, setDraft] = useState(value);
  const [savedFlash, setSavedFlash] = useState(false);
  const dirtyRef = useRef(false);
  // Syncing whenever not dirty races: after commit clears dirty, a render
  // before the refetch lands would restore the old value over the draft.
  const lastSavedRef = useRef(value);
  useEffect(() => {
    if (value === lastSavedRef.current) return; // our own save came back
    if (!dirtyRef.current) setDraft(value); // external update, not editing
  }, [value]);

  const commit = useCallback(() => {
    dirtyRef.current = false;
    if (draft !== value) {
      lastSavedRef.current = draft;
      onSave(draft);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 1200);
    }
  }, [draft, value, onSave]);

  return (
    <div className="relative">
      <Input
        data-testid={`${testIdPrefix}-${String(cardId)}-alt`}
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          dirtyRef.current = true;
          setDraft(e.target.value);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            // Discard edit + restore canonical value, no save.
            e.preventDefault();
            dirtyRef.current = false;
            setDraft(value);
            e.currentTarget.blur();
          }
        }}
      />
      {savedFlash && (
        <span
          data-testid={`${testIdPrefix}-${String(cardId)}-alt-saved`}
          aria-live="polite"
          className="text-primary pointer-events-none absolute end-2 top-1/2 -translate-y-1/2 text-xs"
        >
          <Trans id="plugin.media.altEditor.saved" message="✓ Saved" />
        </span>
      )}
    </div>
  );
}

function FileGlyph({ mime }: { mime: string }): ReactNode {
  return (
    <div className="text-muted-foreground flex size-full items-center justify-center text-xl font-semibold tracking-widest">
      {mimeGlyph(mime)}
    </div>
  );
}

// Fixed aspect ratio so the skeleton-to-image swap causes no layout shift.
function ImageWithFallback({
  src,
  alt,
  mime,
  testId,
}: {
  src: string;
  alt: string;
  mime: string;
  testId?: string;
}): ReactNode {
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  return (
    <>
      {state !== "loaded" && (
        <div
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center ${
            state === "error" ? "bg-muted" : "animate-pulse bg-white/10"
          }`}
        >
          {state === "error" && <FileGlyph mime={mime} />}
        </div>
      )}
      <img
        data-testid={testId}
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        onLoad={() => setState("loaded")}
        onError={() => setState("error")}
        className={`block size-full object-cover transition-opacity duration-200 ${
          state === "loaded" ? "opacity-100" : "opacity-0"
        }`}
      />
    </>
  );
}

function mimeGlyph(mime: string): string {
  if (mime.startsWith("video/")) return "VID";
  if (mime.startsWith("audio/")) return "AUD";
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("zip")) return "ZIP";
  if (mime.startsWith("text/")) return "TXT";
  return "DOC";
}

function formatSize(locale: string, bytes: number | undefined): string {
  // Unit labels (B/KB/MB) are SI/IEC and conventionally untranslated;
  // the locale governs decimal separator (German "1,5 MB" vs US "1.5 MB").
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  const nf = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  if (bytes < 1024) return `${nf.format(bytes)} B`;
  if (bytes < 1024 * 1024) return `${nf.format(bytes / 1024)} KB`;
  return `${nf.format(bytes / 1024 / 1024)} MB`;
}
