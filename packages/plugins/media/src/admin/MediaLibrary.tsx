import type { DragEvent, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const PAGE_SIZE = 24;
const MEDIA_LIST_KEY = ["media", "list"] as const;
const UPLOAD_CONCURRENCY = 4;

// Resolve a media URL to absolute form for copy/display. The plugin
// emits relative `/_plumix/media/serve/<id>` URLs in binding-only
// mode (no `publicUrlBase`); they work for `<img src=...>` on the
// admin page itself but break the moment a user copies the URL into
// an email, an external editor, or a different origin's post body.
// `Copy URL` MUST hand back something pasteable.
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

interface MediaItem {
  readonly id: number;
  readonly title: string;
  readonly mime: string;
  readonly size: number;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly alt: string | null;
  readonly uploadedAt: string;
  readonly uploadedById: number;
}

interface MediaListResponse {
  readonly items: readonly MediaItem[];
  readonly hasMore: boolean;
}

interface CreateUploadUrlResponse {
  readonly uploadUrl: string;
  readonly method: "PUT";
  readonly headers: Record<string, string>;
  readonly mediaId: number;
  readonly storageKey: string;
}

interface ConfirmResponse {
  readonly id: number;
  readonly url: string;
  readonly mime: string;
  readonly size: number;
  readonly storageKey: string;
}

// Hand-rolled oRPC POST. Plugin `media/*` procedures don't surface in the
// admin's typed client (`AppRouterClient` covers core only), so we speak
// the StandardRPC envelope `{ json, meta: [] }` directly.
async function rpcCall<TOutput>(
  procedure: string,
  input: Record<string, unknown>,
): Promise<TOutput> {
  const res = await fetch(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-plumix-request": "1",
    },
    body: JSON.stringify({ json: input, meta: [] }),
  });
  const envelope = (await res.json().catch(() => null)) as {
    json?: unknown;
    meta?: unknown;
  } | null;
  if (!res.ok) {
    const error = envelope?.json as
      | { message?: string; data?: { reason?: string } }
      | undefined;
    const reason =
      error?.data?.reason ?? error?.message ?? `rpc_${String(res.status)}`;
    throw new Error(reason);
  }
  return envelope?.json as TOutput;
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
      else reject(new Error(`upload_failed_${String(xhr.status)}`));
    };
    xhr.onerror = () => reject(new Error("upload_network_error"));
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
  readonly errorMsg: string | null;
  readonly setErrorMsg: (msg: string | null) => void;
  readonly startUpload: (files: readonly File[]) => Promise<void>;
}

function useMediaUpload(invalidateList: () => void): MediaUploadState {
  const [pending, setPending] = useState<readonly PendingUpload[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const uploadOne = useCallback(async (file: File): Promise<void> => {
    const slot: PendingUpload = {
      id: crypto.randomUUID(),
      name: file.name,
      progress: 0,
    };
    setPending((prev) => [...prev, slot]);
    try {
      const init = await rpcCall<CreateUploadUrlResponse>(
        "media/createUploadUrl",
        {
          filename: file.name,
          contentType: file.type,
          size: file.size,
        },
      );
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
        await rpcCall<ConfirmResponse>("media/confirm", { id: init.mediaId });
      } catch (error) {
        await tryCleanupDraft(init.mediaId);
        throw error;
      }
    } catch (error) {
      setErrorMsg(error instanceof Error ? error.message : String(error));
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

  return { pending, errorMsg, setErrorMsg, startUpload };
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

export function MediaLibrary(): ReactNode {
  const queryClient = useQueryClient();
  const [dragging, setDragging] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const list = useInfiniteQuery({
    queryKey: MEDIA_LIST_KEY,
    initialPageParam: 0,
    queryFn: ({ pageParam }: { pageParam: number }) =>
      rpcCall<MediaListResponse>("media/list", {
        limit: PAGE_SIZE,
        offset: pageParam,
      }),
    getNextPageParam: (last, allPages) =>
      last.hasMore ? allPages.length * PAGE_SIZE : undefined,
  });

  const items = useMemo(
    () => list.data?.pages.flatMap((p) => p.items) ?? [],
    [list.data?.pages],
  );

  const invalidateList = useCallback((): void => {
    void queryClient.invalidateQueries({ queryKey: MEDIA_LIST_KEY });
  }, [queryClient]);

  // `list.fetchNextPage` is a stable React Query callback. Passing it
  // directly (rather than wrapping it in a fresh arrow each render)
  // keeps the IntersectionObserver from being torn down + rebuilt on
  // every parent re-render.
  useInfiniteScrollSentinel(
    sentinelRef,
    list.hasNextPage,
    list.isFetchingNextPage,
    list.fetchNextPage,
    list.data?.pages.length,
  );

  const { pending, errorMsg, setErrorMsg, startUpload } =
    useMediaUpload(invalidateList);

  const remove = useMutation({
    mutationFn: (id: number) => rpcCall<{ id: number }>("media/delete", { id }),
    onSuccess: invalidateList,
    onError: (error) =>
      setErrorMsg(error instanceof Error ? error.message : String(error)),
  });

  const update = useMutation({
    mutationFn: (input: { id: number; alt: string }) =>
      rpcCall<{ id: number; alt: string | null }>("media/update", input),
    onSuccess: invalidateList,
    onError: (error) =>
      setErrorMsg(error instanceof Error ? error.message : String(error)),
  });

  // Drop anywhere on the page — including the empty state, the loading
  // state, and the gaps between cards. The grid div used to own these
  // handlers, but it only renders when items exist; on a fresh install
  // the user lands on the empty state and dropping a file did nothing.
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

  // Keep `selectedItem` in state, not derived from `items`. The list
  // refetches on every mutation; deriving would make the drawer
  // disappear silently when the row briefly drops out of the page
  // window or while a refetch is in flight. We refresh from the list
  // by id when a fresh copy is available, never null it from absence.
  const [selectedItem, setSelectedItem] = useState<MediaItem | null>(null);
  useEffect(() => {
    if (selectedItem === null) return;
    const fresh = items.find((it) => it.id === selectedItem.id);
    if (fresh && fresh !== selectedItem) setSelectedItem(fresh);
    // If the row was deleted (not in items AND list is settled), close.
    if (!fresh && list.status === "success" && !list.isFetching) {
      setSelectedItem(null);
    }
  }, [items, list.status, list.isFetching, selectedItem]);

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
      className="relative flex min-h-full gap-6"
      {...dropProps}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="flex items-center justify-between">
          <h1
            data-testid="media-library-title"
            className="text-3xl font-semibold tracking-tight"
          >
            Media Library
          </h1>
          <UploadButton onSelect={(files) => void startUpload(files)} />
        </header>

        {pending.length > 0 && <UploadProgressBar pending={pending} />}

        {list.status === "pending" && <MediaSkeletonGrid />}
        {list.status === "error" && (
          <div
            role="alert"
            data-testid="media-library-error"
            className="text-destructive text-sm"
          >
            Failed to load media.
          </div>
        )}

        {list.status === "success" && items.length === 0 && (
          <Dropzone
            onSelect={(files) => void startUpload(files)}
            highlight={dragging}
          />
        )}

        {list.status === "success" && items.length > 0 && (
          <div
            data-testid="media-library-grid"
            className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4"
          >
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                selected={selectedItem?.id === item.id}
                onOpen={() => setSelectedItem(item)}
              />
            ))}
          </div>
        )}

        <div ref={sentinelRef} data-testid="media-library-sentinel" />

        {list.isFetchingNextPage && (
          <div
            data-testid="media-library-loading-more"
            className="text-muted-foreground text-center text-sm"
          >
            Loading more…
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
      </div>

      {selectedItem && (
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

      {errorMsg && (
        <ErrorBanner
          testIdRoot="media-library-banner-error"
          message={friendlyError(errorMsg)}
          onDismiss={() => setErrorMsg(null)}
        />
      )}
    </div>
  );
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes("Files");
}

// Map opaque RPC `reason` codes to actionable text. The error banner is
// the only surface a user sees when an upload fails — raw reasons like
// `mime_mismatch` read like 404s.
const FRIENDLY_ERRORS: Readonly<Record<string, string>> = {
  storage_not_configured:
    "No storage adapter is wired up — set `storage:` in plumix.config.ts.",
  payload_too_large: "File exceeds the configured maxUploadSize.",
  rpc_413: "File exceeds the configured maxUploadSize.",
  unsupported_media_type:
    "This file type isn't allowed by the media plugin's acceptedTypes.",
  rpc_415: "This file type isn't allowed by the media plugin's acceptedTypes.",
  content_type_mismatch:
    "This file type isn't allowed by the media plugin's acceptedTypes.",
  mime_mismatch: "The uploaded bytes don't match the declared file type.",
  object_not_found:
    "Upload didn't reach storage — check your bucket's CORS rules.",
  already_confirmed:
    "This upload was already confirmed by another tab or device.",
  media_meta_invalid: "Server couldn't process this upload. Try again.",
  db_insert_failed: "Server couldn't process this upload. Try again.",
  storage_put_failed: "Server couldn't process this upload. Try again.",
  content_length_required:
    "Upload missing Content-Length — your browser/proxy may be using chunked transfer.",
  csrf_token_missing:
    "Request blocked by CSRF check. Reload the page and try again.",
};

function friendlyError(raw: string): string {
  return FRIENDLY_ERRORS[raw] ?? raw;
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
      <button
        type="button"
        data-testid={`${testIdRoot}-dismiss`}
        onClick={onDismiss}
        className="text-xs underline"
      >
        Dismiss
      </button>
    </div>
  );
}

async function tryCleanupDraft(mediaId: number): Promise<void> {
  try {
    await rpcCall<{ id: number }>("media/delete", { id: mediaId });
  } catch {
    // Best-effort — server-side draft GC will catch it.
  }
}

// First-impression empty state. Mirrors the shape of CF R2's bucket
// dashboard: a dashed-border drop target with cloud-up glyph and an
// inline "select from computer" picker. The page-wide drop handlers
// already cover the entire library, but a visible target on the empty
// state tells the user the library accepts files at all — without it
// the page reads as "nothing to do here".
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
          Your library is empty. Add files to get started.
        </p>
        <p className="text-muted-foreground m-0 text-xs">
          Drag and drop or{" "}
          <span className="underline">select from computer</span>
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
      Upload
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
          Uploading {String(pending.length)} file
          {pending.length === 1 ? "" : "s"}…
        </span>
        <span data-testid="media-library-progress-pct">{pct}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-sm bg-white/10">
        <div
          className="bg-primary h-full transition-[width] duration-200 ease-in-out"
          style={{ width: `${String(pct)}%` }}
        />
      </div>
    </div>
  );
}

function MediaCard({
  item,
  selected,
  onOpen,
}: {
  item: MediaItem;
  selected: boolean;
  onOpen: () => void;
  // onDelete + onAltChange removed from card — both belong to the
  // detail drawer now (matches the WP/screenshot pattern: card is
  // the index, drawer is the detail editor).
}): ReactNode {
  const isImage = item.mime.startsWith("image/");

  return (
    <article
      data-testid={`media-card-${String(item.id)}`}
      data-selected={selected ? "true" : undefined}
      className={`border-border bg-card relative flex cursor-pointer flex-col gap-2 rounded-lg border p-3 ${
        selected ? "outline-primary outline-2 outline-offset-1" : ""
      }`}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`Open details for ${item.title}`}
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
      <div className="flex gap-2 text-[0.7rem] opacity-60">
        <span>{formatShortDate(item.uploadedAt)}</span>
        <span>·</span>
        <span>{formatSize(item.size)}</span>
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
      className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4"
    >
      {placeholders.map((i) => (
        <div
          key={i}
          aria-hidden="true"
          className="border-border bg-card flex flex-col gap-2 rounded-lg border p-3"
        >
          <div className="aspect-square w-full animate-pulse rounded-sm bg-white/10" />
          <div className="h-3.5 w-[70%] rounded-sm bg-white/[0.06]" />
          <div className="h-[0.7rem] w-[40%] rounded-sm bg-white/[0.04]" />
        </div>
      ))}
    </div>
  );
}

function FileTypeBadge({ mime }: { mime: string }): ReactNode {
  const label = badgeLabel(mime);
  if (!label) return null;
  return (
    <span className="absolute top-2 right-2 rounded-sm bg-black/75 px-1.5 py-0.5 text-[0.65rem] font-semibold tracking-wider text-white">
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

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d
    .toLocaleDateString(undefined, { month: "short", day: "numeric" })
    .toUpperCase();
}

function formatLongDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
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
      className="border-border bg-card sticky top-8 flex max-h-[calc(100vh-4rem)] w-80 flex-shrink-0 flex-col self-start overflow-y-auto rounded-lg border"
    >
      <div className="border-border flex items-center justify-between border-b px-4 py-3">
        <span className="text-xs tracking-wider opacity-70">ASSET DETAILS</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          data-testid="media-detail-close"
          className="cursor-pointer rounded px-1.5 py-0.5 text-base leading-none"
        >
          ×
        </button>
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

        <DetailField label="ASSET TYPE" value={item.mime} />
        <DetailField label="FILE SIZE" value={formatSize(item.size)} />
        <DetailField label="UPLOADED" value={formatLongDate(item.uploadedAt)} />

        <div>
          <DetailLabel>ALT TEXT</DetailLabel>
          <AltEditor
            cardId={item.id}
            testIdPrefix="media-detail"
            value={item.alt ?? ""}
            placeholder={
              isImage ? "Describe this image…" : "Add a description…"
            }
            onSave={onAltChange}
          />
        </div>

        <div>
          <DetailLabel>URL</DetailLabel>
          <div className="flex items-center gap-2">
            <code
              data-testid="media-detail-url"
              className="flex-1 truncate text-[0.7rem] break-all opacity-85"
              title={absoluteUrl}
            >
              {absoluteUrl}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              data-testid="media-detail-copy"
              className="border-border flex-shrink-0 cursor-pointer rounded border bg-transparent px-2 py-1 text-[0.7rem]"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="border-border flex gap-2 border-t pt-2">
          <a
            // Always go through the worker serve route with
            // ?attachment=1 — the HTML `download` attribute is ignored
            // cross-origin (e.g. when `publicUrlBase` is configured),
            // but the route always sends `Content-Disposition:
            // attachment` for this query param, so downloads work
            // regardless of which mode `item.url` is in.
            href={`/_plumix/media/serve/${String(item.id)}?attachment=1`}
            download={item.title}
            data-testid="media-detail-download"
            className="bg-card hover:bg-muted flex-1 rounded border px-3 py-2 text-center text-xs no-underline"
          >
            Download
          </a>
          <button
            type="button"
            data-testid="media-detail-delete"
            onClick={() => setConfirmingDelete(true)}
            className="border-border flex-1 cursor-pointer rounded border bg-transparent px-3 py-2 text-xs"
          >
            Delete
          </button>
        </div>
      </div>
      {confirmingDelete && (
        <ConfirmDialog
          title="Delete this asset?"
          description={`"${item.title}" will be removed permanently. Pages or posts that embed it will show a broken link.`}
          confirmLabel="Delete"
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
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  onCancel,
  onConfirm,
}: {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}): ReactNode {
  // Close on ESC; trap obvious-bg click as cancel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      data-testid="confirm-dialog-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="border-border bg-card flex w-full max-w-md flex-col gap-3 rounded-lg border p-5">
        <h3
          id="confirm-dialog-title"
          data-testid="confirm-dialog-title"
          className="m-0 text-base font-semibold"
        >
          {title}
        </h3>
        {description && (
          <p className="m-0 text-sm leading-snug opacity-75">{description}</p>
        )}
        <div className="mt-2 flex justify-end gap-2">
          <button
            type="button"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            className="border-border cursor-pointer rounded border bg-transparent px-3.5 py-2 text-[0.8rem]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            autoFocus
            className={`cursor-pointer rounded border px-3.5 py-2 text-[0.8rem] font-semibold ${
              danger
                ? "border-destructive bg-destructive text-white"
                : "border-primary bg-primary text-primary-foreground"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

function DetailLabel({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mb-1 text-[0.7rem] tracking-wider opacity-60">
      {children}
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
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
  // Track the last value WE saved so we can recognise it when it
  // round-trips back via list refetch and not stomp the user's draft.
  // The naive "if not dirty, sync" approach raced: between commit
  // (which clears dirty) and the refetch arriving with the new value,
  // a re-render would set draft back to the OLD value because the
  // effect ran before the refetch updated `value`.
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
      <input
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
        className="border-border focus:border-primary w-full rounded-md border bg-white/[0.03] px-2.5 py-2 text-[0.8125rem] leading-snug outline-none focus:bg-white/5"
      />
      {savedFlash && (
        <span
          data-testid={`${testIdPrefix}-${String(cardId)}-alt-saved`}
          aria-live="polite"
          className="text-primary pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-[0.65rem]"
        >
          ✓ Saved
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

// Image with avatar-style fallback. Shows a shimmer skeleton while
// loading, fades the image in once `onLoad` fires, falls back to the
// file glyph if the image errors. Container has a fixed aspect ratio
// so there's no layout shift between skeleton → image.
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

function formatSize(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
