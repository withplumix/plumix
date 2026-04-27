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

// Shimmer keyframes — injected once at module load. Plugin chunks
// can't rely on host CSS scanning their classnames (host Tailwind
// pipeline doesn't see plugin source), so we inline the small bit of
// CSS we need.
const SHIMMER_STYLE_ID = "plumix-media-shimmer";
if (
  typeof document !== "undefined" &&
  !document.getElementById(SHIMMER_STYLE_ID)
) {
  const styleEl = document.createElement("style");
  styleEl.id = SHIMMER_STYLE_ID;
  styleEl.textContent = `
@keyframes plumix-shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}
`;
  document.head.appendChild(styleEl);
}

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

export function MediaLibrary(): ReactNode {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<readonly PendingUpload[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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

  // Auto-fetch the next page when the sentinel scrolls into view. The
  // dependency on `list.data?.pages.length` re-binds the observer after
  // each page lands so we don't miss the next intersection.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    if (!list.hasNextPage) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !list.isFetchingNextPage) {
        void list.fetchNextPage();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [
    list,
    list.hasNextPage,
    list.isFetchingNextPage,
    list.data?.pages.length,
  ]);

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
        await rpcCall<ConfirmResponse>("media/confirm", {
          id: init.mediaId,
        });
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
      style={{
        display: "flex",
        gap: "1.5rem",
        position: "relative",
        minHeight: "100%",
      }}
      {...dropProps}
    >
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          gap: "1.5rem",
          minWidth: 0,
        }}
      >
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
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
              gap: "1rem",
            }}
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
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              bottom: "1rem",
              left: "1rem",
              border: "2px dashed var(--primary, #888)",
              background: "rgba(127,127,127,0.05)",
              borderRadius: "0.5rem",
              pointerEvents: "none",
            }}
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
function friendlyError(raw: string): string {
  switch (raw) {
    case "storage_not_configured":
      return "No storage adapter is wired up — set `storage:` in plumix.config.ts.";
    case "payload_too_large":
    case "rpc_413":
      return "File exceeds the configured maxUploadSize.";
    case "unsupported_media_type":
    case "rpc_415":
    case "content_type_mismatch":
      return "This file type isn't allowed by the media plugin's acceptedTypes.";
    case "mime_mismatch":
      return "The uploaded bytes don't match the declared file type.";
    case "object_not_found":
      return "Upload didn't reach storage — check your bucket's CORS rules.";
    case "already_confirmed":
      return "This upload was already confirmed by another tab or device.";
    case "media_meta_invalid":
    case "db_insert_failed":
    case "storage_put_failed":
      return "Server couldn't process this upload. Try again.";
    case "content_length_required":
      return "Upload missing Content-Length — your browser/proxy may be using chunked transfer.";
    case "csrf_token_missing":
      return "Request blocked by CSRF check. Reload the page and try again.";
    default:
      return raw;
  }
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
// Plugin admin chunks ship Tailwind class strings the host admin's
// CSS pipeline never scanned, so unusual classes (`size-12`,
// `border-dashed`, `py-16`, opacity variants) don't render. Keep
// common classes for typography but use inline styles for the
// load-bearing layout primitives so the dropzone always has a
// visible shape and the SVG can't escape its container.
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
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "4rem 1rem",
        borderRadius: "0.5rem",
        border: `2px dashed ${highlight ? "var(--primary, #888)" : "var(--border, #444)"}`,
        background: highlight ? "rgba(127,127,127,0.05)" : "transparent",
        textAlign: "center",
        cursor: "pointer",
        transition: "border-color 120ms ease",
      }}
    >
      <input
        type="file"
        multiple
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clip: "rect(0,0,0,0)",
          whiteSpace: "nowrap",
          border: 0,
        }}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          if (files.length > 0) onSelect(files);
          event.target.value = "";
        }}
      />
      <CloudUploadGlyph />
      <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
        <p style={{ fontSize: "0.875rem", fontWeight: 500, margin: 0 }}>
          Your library is empty. Add files to get started.
        </p>
        <p
          style={{
            fontSize: "0.75rem",
            color: "var(--muted-foreground, #888)",
            margin: 0,
          }}
        >
          Drag and drop or{" "}
          <span style={{ textDecoration: "underline" }}>
            select from computer
          </span>
        </p>
      </div>
    </label>
  );
}

function CloudUploadGlyph(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      width="48"
      height="48"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ color: "var(--muted-foreground, #888)" }}
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
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "0.375rem",
        padding: "0.75rem 1rem",
        border: "1px solid var(--border, rgba(255,255,255,0.1))",
        borderRadius: "0.375rem",
        background: "var(--card, rgba(255,255,255,0.02))",
        fontSize: "0.75rem",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <span>
          Uploading {String(pending.length)} file
          {pending.length === 1 ? "" : "s"}…
        </span>
        <span data-testid="media-library-progress-pct">{pct}%</span>
      </div>
      <div
        style={{
          height: "6px",
          width: "100%",
          background: "rgba(255,255,255,0.08)",
          borderRadius: "0.125rem",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${String(pct)}%`,
            background: "var(--primary, #fff)",
            transition: "width 200ms ease",
          }}
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
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        gap: "0.5rem",
        padding: "0.75rem",
        borderRadius: "0.5rem",
        border: "1px solid var(--border, rgba(255,255,255,0.1))",
        background: "var(--card, rgba(255,255,255,0.02))",
        outline: selected ? "2px solid var(--primary, #fff)" : undefined,
        outlineOffset: selected ? "1px" : undefined,
        cursor: "pointer",
      }}
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
      <div
        style={{
          position: "relative",
          aspectRatio: "1 / 1",
          width: "100%",
          overflow: "hidden",
          borderRadius: "0.25rem",
          background: "var(--muted, rgba(127,127,127,0.1))",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
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
        style={{
          fontSize: "0.875rem",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={item.title}
      >
        {item.title}
      </div>
      <div
        style={{
          fontSize: "0.7rem",
          opacity: 0.6,
          display: "flex",
          gap: "0.5rem",
        }}
      >
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
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
        gap: "1rem",
      }}
    >
      {placeholders.map((i) => (
        <div
          key={i}
          aria-hidden="true"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            border: "1px solid var(--border, rgba(255,255,255,0.08))",
            background: "var(--card, rgba(255,255,255,0.02))",
          }}
        >
          <div
            style={{
              aspectRatio: "1 / 1",
              width: "100%",
              borderRadius: "0.25rem",
              background:
                "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)",
              backgroundSize: "200% 100%",
              animation: "plumix-shimmer 1.4s ease-in-out infinite",
            }}
          />
          <div
            style={{
              height: "0.875rem",
              width: "70%",
              borderRadius: "0.125rem",
              background: "rgba(255,255,255,0.06)",
            }}
          />
          <div
            style={{
              height: "0.7rem",
              width: "40%",
              borderRadius: "0.125rem",
              background: "rgba(255,255,255,0.04)",
            }}
          />
        </div>
      ))}
    </div>
  );
}

function FileTypeBadge({ mime }: { mime: string }): ReactNode {
  const label = badgeLabel(mime);
  if (!label) return null;
  return (
    <span
      style={{
        position: "absolute",
        top: "0.5rem",
        right: "0.5rem",
        background: "rgba(0,0,0,0.75)",
        color: "#fff",
        padding: "0.125rem 0.4rem",
        borderRadius: "0.125rem",
        fontSize: "0.65rem",
        letterSpacing: "0.05em",
        fontWeight: 600,
      }}
    >
      {label}
    </span>
  );
}

function badgeLabel(mime: string): string | null {
  if (mime === "application/pdf") return "PDF";
  if (mime.includes("wordprocessingml")) return "DOCX";
  if (mime.includes("spreadsheetml")) return "XLSX";
  if (mime.includes("presentationml")) return "PPTX";
  if (mime === "application/msword") return "DOC";
  if (mime === "application/vnd.ms-excel") return "XLS";
  if (mime === "application/vnd.ms-powerpoint") return "PPT";
  if (mime === "application/zip") return "ZIP";
  const sub = mime.split("/")[1] ?? "";
  return sub.replace(/^x-/, "").toUpperCase().slice(0, 5);
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
      style={{
        width: "320px",
        flexShrink: 0,
        position: "sticky",
        top: "2rem",
        alignSelf: "flex-start",
        maxHeight: "calc(100vh - 4rem)",
        overflowY: "auto",
        border: "1px solid var(--border, rgba(255,255,255,0.1))",
        borderRadius: "0.5rem",
        background: "var(--card, rgba(255,255,255,0.02))",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0.75rem 1rem",
          borderBottom: "1px solid var(--border, rgba(255,255,255,0.1))",
        }}
      >
        <span
          style={{ fontSize: "0.75rem", letterSpacing: "0.05em", opacity: 0.7 }}
        >
          ASSET DETAILS
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          data-testid="media-detail-close"
          style={{
            all: "unset",
            cursor: "pointer",
            padding: "0.125rem 0.375rem",
            borderRadius: "0.25rem",
            fontSize: "1rem",
            lineHeight: 1,
          }}
        >
          ×
        </button>
      </div>

      <div
        style={{
          aspectRatio: "1 / 1",
          width: "100%",
          background: "var(--muted, rgba(127,127,127,0.1))",
          overflow: "hidden",
        }}
      >
        {isImage ? (
          <img
            src={item.thumbnailUrl}
            alt={item.alt ?? item.title}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        ) : (
          <FileGlyph mime={item.mime} />
        )}
      </div>

      <div
        style={{
          padding: "1rem",
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: 600,
              margin: 0,
              wordBreak: "break-all",
            }}
          >
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <code
              data-testid="media-detail-url"
              style={{
                fontSize: "0.7rem",
                flex: 1,
                wordBreak: "break-all",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                opacity: 0.85,
              }}
              title={absoluteUrl}
            >
              {absoluteUrl}
            </code>
            <button
              type="button"
              onClick={() => void copy()}
              data-testid="media-detail-copy"
              style={{
                flexShrink: 0,
                padding: "0.25rem 0.5rem",
                fontSize: "0.7rem",
                background: "transparent",
                color: "inherit",
                border: "1px solid var(--border, rgba(255,255,255,0.15))",
                borderRadius: "0.25rem",
                cursor: "pointer",
              }}
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            paddingTop: "0.5rem",
            borderTop: "1px solid var(--border, rgba(255,255,255,0.1))",
          }}
        >
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
            className="bg-card hover:bg-muted rounded border text-xs"
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              textAlign: "center",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            Download
          </a>
          <button
            type="button"
            data-testid="media-detail-delete"
            onClick={() => setConfirmingDelete(true)}
            style={{
              flex: 1,
              padding: "0.5rem 0.75rem",
              cursor: "pointer",
              background: "transparent",
              color: "inherit",
              border: "1px solid var(--border, rgba(255,255,255,0.15))",
              borderRadius: "0.25rem",
              fontSize: "0.75rem",
            }}
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
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.6)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "1rem",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--card, #1a1a1a)",
          border: "1px solid var(--border, rgba(255,255,255,0.1))",
          borderRadius: "0.5rem",
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
          color: "inherit",
        }}
      >
        <h3
          id="confirm-dialog-title"
          data-testid="confirm-dialog-title"
          style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}
        >
          {title}
        </h3>
        {description && (
          <p
            style={{
              fontSize: "0.85rem",
              opacity: 0.75,
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            {description}
          </p>
        )}
        <div
          style={{
            display: "flex",
            gap: "0.5rem",
            justifyContent: "flex-end",
            marginTop: "0.5rem",
          }}
        >
          <button
            type="button"
            data-testid="confirm-dialog-cancel"
            onClick={onCancel}
            style={{
              padding: "0.5rem 0.875rem",
              borderRadius: "0.25rem",
              border: "1px solid var(--border, rgba(255,255,255,0.15))",
              background: "transparent",
              color: "inherit",
              cursor: "pointer",
              fontSize: "0.8rem",
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            data-testid="confirm-dialog-confirm"
            onClick={onConfirm}
            autoFocus
            style={{
              padding: "0.5rem 0.875rem",
              borderRadius: "0.25rem",
              border: "1px solid",
              borderColor: danger
                ? "rgba(220,80,80,0.7)"
                : "var(--primary, rgba(255,255,255,0.4))",
              background: danger
                ? "rgba(220,80,80,0.85)"
                : "var(--primary, #fff)",
              color: danger ? "#fff" : "var(--primary-foreground, #000)",
              cursor: "pointer",
              fontSize: "0.8rem",
              fontWeight: 600,
            }}
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
    <div
      style={{
        fontSize: "0.7rem",
        letterSpacing: "0.05em",
        opacity: 0.6,
        marginBottom: "0.25rem",
      }}
    >
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
      <div style={{ fontSize: "0.875rem", wordBreak: "break-word" }}>
        {value}
      </div>
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
    <div style={{ position: "relative" }}>
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
        style={{
          width: "100%",
          background: "rgba(255,255,255,0.03)",
          border: "1px solid var(--border, rgba(255,255,255,0.12))",
          borderRadius: "0.375rem",
          padding: "0.5rem 0.625rem",
          fontSize: "0.8125rem",
          color: "inherit",
          outline: "none",
          fontFamily: "inherit",
          lineHeight: 1.4,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--primary, #fff)";
          e.currentTarget.style.background = "rgba(255,255,255,0.05)";
        }}
        onBlurCapture={(e) => {
          e.currentTarget.style.borderColor =
            "var(--border, rgba(255,255,255,0.12))";
          e.currentTarget.style.background = "rgba(255,255,255,0.03)";
        }}
      />
      {savedFlash && (
        <span
          data-testid={`${testIdPrefix}-${String(cardId)}-alt-saved`}
          aria-live="polite"
          style={{
            position: "absolute",
            right: "0.5rem",
            top: "50%",
            transform: "translateY(-50%)",
            fontSize: "0.65rem",
            color: "var(--primary, #8f8)",
            pointerEvents: "none",
          }}
        >
          ✓ Saved
        </span>
      )}
    </div>
  );
}

function FileGlyph({ mime }: { mime: string }): ReactNode {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "1.25rem",
        fontWeight: 600,
        letterSpacing: "0.1em",
        color: "var(--muted-foreground, rgba(255,255,255,0.5))",
      }}
    >
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
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background:
              state === "error"
                ? "var(--muted, rgba(127,127,127,0.1))"
                : "linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.10) 50%, rgba(255,255,255,0.04) 100%)",
            backgroundSize: "200% 100%",
            animation:
              state === "loading"
                ? "plumix-shimmer 1.4s ease-in-out infinite"
                : undefined,
          }}
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
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          opacity: state === "loaded" ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
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
