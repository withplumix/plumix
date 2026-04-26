import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

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

export function MediaLibrary(): ReactNode {
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const list = useQuery({
    queryKey: [...MEDIA_LIST_KEY, { page }] as const,
    queryFn: () =>
      rpcCall<MediaListResponse>("media/list", {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const invalidateList = (): void => {
    // TanStack Query matches by queryKey prefix by default — listing
    // the prefix is enough to invalidate every page.
    void queryClient.invalidateQueries({ queryKey: MEDIA_LIST_KEY });
  };

  const upload = useMutation({
    mutationFn: async (file: File): Promise<ConfirmResponse> => {
      // Phase 1 — server creates a `draft` entry + signs a PUT URL.
      const init = await rpcCall<CreateUploadUrlResponse>(
        "media/createUploadUrl",
        {
          filename: file.name,
          contentType: file.type,
          size: file.size,
        },
      );

      // Phase 2 — browser PUTs the bytes directly to storage.
      // Phase 3 — server head-checks + magic-byte-sniffs the upload,
      // then flips draft → published.
      // Any failure between phase 1 and phase 3 leaves a zombie draft
      // on the server; the catch fires a best-effort `media.delete` so
      // the row doesn't pile up. We rethrow the original error — a
      // failed cleanup shouldn't shadow it.
      try {
        const putRes = await fetch(init.uploadUrl, {
          method: init.method,
          headers: init.headers,
          body: file,
        });
        if (!putRes.ok) {
          throw new Error(`upload_failed_${String(putRes.status)}`);
        }
        return await rpcCall<ConfirmResponse>("media/confirm", {
          id: init.mediaId,
        });
      } catch (error) {
        await tryCleanupDraft(init.mediaId);
        throw error;
      }
    },
    onSuccess: () => {
      // Jump back to page 1 so the freshly-uploaded asset (sorted by
      // `updated_at desc`) is in view; uploading from a later page would
      // otherwise hide the new card.
      setPage(0);
      invalidateList();
    },
  });

  const remove = useMutation({
    mutationFn: (id: number) => rpcCall<{ id: number }>("media/delete", { id }),
    onSuccess: invalidateList,
  });

  const items = list.status === "success" ? list.data.items : [];
  const hasNext = list.status === "success" && list.data.hasMore;

  return (
    <div data-testid="media-library" className="flex flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1
          data-testid="media-library-title"
          className="text-3xl font-semibold tracking-tight"
        >
          Media Library
        </h1>
        <UploadButton
          onSelect={(file) => upload.mutate(file)}
          disabled={upload.isPending}
        />
      </header>

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
          No media yet — upload your first asset.
        </div>
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
              onDelete={() => {
                if (
                  typeof window !== "undefined" &&
                  window.confirm(`Delete ${item.title}?`)
                ) {
                  remove.mutate(item.id);
                }
              }}
              deleting={remove.isPending && remove.variables === item.id}
            />
          ))}
        </div>
      )}

      <Pagination page={page} hasNext={hasNext} onChange={setPage} />

      {upload.error && (
        <ErrorBanner
          testIdRoot="media-library-upload-error"
          error={upload.error}
          onDismiss={() => upload.reset()}
        />
      )}
      {remove.error && (
        <ErrorBanner
          testIdRoot="media-library-delete-error"
          error={remove.error}
          onDismiss={() => remove.reset()}
        />
      )}
    </div>
  );
}

function ErrorBanner({
  testIdRoot,
  error,
  onDismiss,
}: {
  testIdRoot: string;
  error: unknown;
  onDismiss: () => void;
}): ReactNode {
  return (
    <div
      role="alert"
      data-testid={testIdRoot}
      className="text-destructive flex items-center justify-between gap-3 text-sm"
    >
      <span>{error instanceof Error ? error.message : String(error)}</span>
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
    // Best-effort — if the cleanup fails the server-side draft GC will
    // catch it. We don't want to mask the original upload error.
  }
}

function UploadButton({
  onSelect,
  disabled,
}: {
  onSelect: (file: File) => void;
  disabled?: boolean;
}): ReactNode {
  return (
    <label
      data-testid="media-library-upload"
      className="bg-card hover:bg-muted cursor-pointer rounded border px-4 py-2 text-sm"
    >
      <input
        type="file"
        className="sr-only"
        disabled={disabled}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onSelect(file);
          event.target.value = "";
        }}
      />
      {disabled ? "Uploading…" : "Upload"}
    </label>
  );
}

function MediaCard({
  item,
  onDelete,
  deleting,
}: {
  item: MediaItem;
  onDelete: () => void;
  deleting: boolean;
}): ReactNode {
  const isImage = item.mime.startsWith("image/");
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
            alt={item.title}
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          <FileGlyph mime={item.mime} />
        )}
      </div>
      <div className="truncate text-sm">{item.title}</div>
      <div className="text-muted-foreground text-xs">
        {item.mime} · {formatSize(item.size)}
      </div>
      <button
        type="button"
        data-testid={`media-card-${String(item.id)}-delete`}
        disabled={deleting}
        onClick={onDelete}
        className="bg-card hover:bg-destructive hover:text-destructive-foreground absolute top-2 right-2 rounded border px-2 py-0.5 text-xs opacity-0 transition group-hover:opacity-100 disabled:opacity-50"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
    </article>
  );
}

function FileGlyph({ mime }: { mime: string }): ReactNode {
  return (
    <div className="text-muted-foreground flex h-full w-full items-center justify-center text-2xl font-medium tracking-wider">
      {mimeGlyph(mime)}
    </div>
  );
}

// Tiny vocabulary — no external icon set; just a 2-3 letter token so
// the category is glanceable. Order matters: `application/zip` would
// otherwise fall through to the generic `DOC` bucket.
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

function Pagination({
  page,
  hasNext,
  onChange,
}: {
  page: number;
  hasNext: boolean;
  onChange: (next: number) => void;
}): ReactNode {
  return (
    <nav className="flex items-center justify-center gap-3">
      <button
        type="button"
        data-testid="media-library-prev"
        disabled={page === 0}
        onClick={() => onChange(page - 1)}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        Previous
      </button>
      <span
        data-testid="media-library-page"
        className="text-muted-foreground text-sm"
      >
        Page {String(page + 1)}
      </span>
      <button
        type="button"
        data-testid="media-library-next"
        disabled={!hasNext}
        onClick={() => onChange(page + 1)}
        className="rounded border px-3 py-1 text-sm disabled:opacity-50"
      >
        Next
      </button>
    </nav>
  );
}

function formatSize(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
