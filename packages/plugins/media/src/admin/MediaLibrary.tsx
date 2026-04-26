import type { DragEvent, ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const PAGE_SIZE = 24;
const MEDIA_LIST_KEY = ["media", "list"] as const;
const UPLOAD_CONCURRENCY = 4;

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
  readonly slug: string;
  readonly mime: string;
  readonly size: number;
  readonly url: string;
  readonly thumbnailUrl: string;
  readonly alt: string | null;
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

  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

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

  return (
    <div
      data-testid="media-library"
      className="relative flex flex-col gap-6 p-8"
      {...dropProps}
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

      {list.status === "pending" && (
        <div data-testid="media-library-loading" className="text-sm">
          Loading…
        </div>
      )}
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
              onDelete={() => {
                if (
                  typeof window !== "undefined" &&
                  window.confirm(`Delete ${item.title}?`)
                ) {
                  remove.mutate(item.id);
                }
              }}
              onAltChange={(alt) => update.mutate({ id: item.id, alt })}
              deleting={remove.isPending && remove.variables === item.id}
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
  return (
    <div
      data-testid="media-library-progress"
      className="text-muted-foreground flex flex-col gap-1 text-xs"
    >
      <div className="flex items-center justify-between">
        <span>
          Uploading {String(pending.length)} file
          {pending.length === 1 ? "" : "s"}…
        </span>
        <span>{Math.round(ratio * 100)}%</span>
      </div>
      <div className="bg-muted h-1 w-full overflow-hidden rounded">
        <div
          className="bg-primary h-full transition-[width]"
          style={{ width: `${String(Math.round(ratio * 100))}%` }}
        />
      </div>
    </div>
  );
}

function MediaCard({
  item,
  onDelete,
  onAltChange,
  deleting,
}: {
  item: MediaItem;
  onDelete: () => void;
  onAltChange: (alt: string) => void;
  deleting: boolean;
}): ReactNode {
  const [copied, setCopied] = useState(false);
  const isImage = item.mime.startsWith("image/");

  const copyUrl = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(item.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard write rejected (HTTP context, denied permission, …).
      // The URL is already visible on the card; user can copy by hand.
    }
  }, [item.url]);

  return (
    <article
      data-testid={`media-card-${String(item.id)}`}
      className="bg-card group relative flex flex-col gap-2 rounded border p-3"
    >
      <div
        style={{
          aspectRatio: "1 / 1",
          width: "100%",
          overflow: "hidden",
          borderRadius: "0.25rem",
          background: "var(--muted, rgba(127,127,127,0.1))",
        }}
      >
        {isImage ? (
          <img
            data-testid={`media-card-${String(item.id)}-thumb`}
            src={item.thumbnailUrl}
            alt={item.alt ?? item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <FileGlyph mime={item.mime} />
        )}
      </div>
      <div className="truncate text-sm">{item.title}</div>
      <AltEditor
        cardId={item.id}
        value={item.alt ?? ""}
        placeholder={isImage ? "Describe this image…" : "Add a description…"}
        onSave={onAltChange}
      />
      <div className="text-muted-foreground text-xs">
        {item.mime} · {formatSize(item.size)}
      </div>
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
        <button
          type="button"
          data-testid={`media-card-${String(item.id)}-copy`}
          onClick={() => void copyUrl()}
          className="bg-card hover:bg-muted rounded border px-2 py-0.5 text-xs"
        >
          {copied ? "Copied" : "Copy URL"}
        </button>
        <button
          type="button"
          data-testid={`media-card-${String(item.id)}-delete`}
          disabled={deleting}
          onClick={onDelete}
          className="bg-card hover:bg-destructive hover:text-destructive-foreground rounded border px-2 py-0.5 text-xs disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>
    </article>
  );
}

function AltEditor({
  cardId,
  value,
  placeholder,
  onSave,
}: {
  cardId: number;
  value: string;
  placeholder: string;
  onSave: (alt: string) => void;
}): ReactNode {
  const [draft, setDraft] = useState(value);
  const dirtyRef = useRef(false);
  // Resync from the canonical value only when the user isn't mid-edit.
  // Without this, a list refetch landing while the input is focused
  // would silently stomp the in-progress draft.
  useEffect(() => {
    if (!dirtyRef.current) setDraft(value);
  }, [value]);
  return (
    <input
      data-testid={`media-card-${String(cardId)}-alt`}
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => {
        dirtyRef.current = true;
        setDraft(e.target.value);
      }}
      onBlur={() => {
        dirtyRef.current = false;
        if (draft !== value) onSave(draft);
      }}
      className="text-muted-foreground hover:bg-muted focus:bg-muted w-full truncate rounded bg-transparent px-1 text-xs outline-none"
    />
  );
}

function FileGlyph({ mime }: { mime: string }): ReactNode {
  return (
    <div className="text-muted-foreground flex h-full w-full items-center justify-center text-2xl font-medium tracking-wider">
      {mimeGlyph(mime)}
    </div>
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
