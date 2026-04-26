import type { ReactNode } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

const PAGE_SIZE = 24;
const MEDIA_LIST_KEY = ["media", "list"] as const;

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
        await putWithProgress(
          init.uploadUrl,
          init.method,
          init.headers,
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
      // Concurrent uploads — simpler than batching and the bottleneck
      // is the user's network anyway.
      await Promise.all(files.map(uploadOne));
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

  return (
    <div data-testid="media-library" className="flex flex-col gap-6 p-8">
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
        <div
          data-testid="media-library-empty"
          className="text-muted-foreground py-12 text-center text-sm"
        >
          No media yet — upload your first asset, or drop files anywhere on this
          page.
        </div>
      )}

      {list.status === "success" && items.length > 0 && (
        <div
          data-testid="media-library-grid"
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const files = Array.from(e.dataTransfer.files);
            void startUpload(files);
          }}
          className={`grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-4 ${
            dragging ? "ring-primary rounded ring-2" : ""
          }`}
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

      {errorMsg && (
        <ErrorBanner
          testIdRoot="media-library-banner-error"
          message={errorMsg}
          onDismiss={() => setErrorMsg(null)}
        />
      )}
    </div>
  );
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
      <div className="bg-muted aspect-square w-full overflow-hidden rounded">
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
  // Resync if the canonical value changes (e.g. invalidated list refetch).
  useEffect(() => setDraft(value), [value]);
  return (
    <input
      data-testid={`media-card-${String(cardId)}-alt`}
      type="text"
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
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

const GLYPH_RULES: readonly (readonly [(mime: string) => boolean, string])[] = [
  [(m) => m.startsWith("video/"), "VID"],
  [(m) => m.startsWith("audio/"), "AUD"],
  [(m) => m === "application/pdf", "PDF"],
  [(m) => m.includes("zip"), "ZIP"],
  [(m) => m.startsWith("text/"), "TXT"],
];

function mimeGlyph(mime: string): string {
  return GLYPH_RULES.find(([test]) => test(mime))?.[1] ?? "DOC";
}

function formatSize(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
