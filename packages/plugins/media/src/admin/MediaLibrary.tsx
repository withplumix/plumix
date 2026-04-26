import type { ReactNode } from "react";
import { useState } from "react";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { AppRouterClient } from "@plumix/core";

const PAGE_SIZE = 24;

const link = new RPCLink({
  url: () => `${window.location.origin}/_plumix/rpc`,
  headers: () => ({ "x-plumix-request": "1" }),
});
const client = createORPCClient<AppRouterClient>(link);
const orpc = createTanstackQueryUtils(client);

interface UploadResponse {
  readonly id: number;
  readonly slug: string;
  readonly url: string;
  readonly storageKey: string;
  readonly mime: string;
  readonly size: number;
}

// Hand-rolled oRPC POST. Plugin `media/*` procedures ride the same RPC
// transport as core, but typed router clients carry the entire core
// surface; for two narrow calls inside our own page, the round trip
// over `fetch` keeps the bundle lean. Both directions speak oRPC's
// StandardRPC wire envelope `{ json, meta: [] }`.
async function rpcCall(
  procedure: string,
  input: Record<string, unknown>,
): Promise<unknown> {
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
    const reason = error?.data?.reason ?? error?.message ?? `rpc_${res.status}`;
    throw new Error(reason);
  }
  return envelope?.json;
}

interface MediaMeta {
  readonly mime?: string;
  readonly size?: number;
  readonly storageKey?: string;
}

interface MediaEntry {
  readonly id: number;
  readonly title: string;
  readonly slug: string;
  readonly meta: Record<string, unknown>;
}

export function MediaLibrary(): ReactNode {
  const [page, setPage] = useState(0);
  const queryClient = useQueryClient();

  const list = useQuery(
    orpc.entry.list.queryOptions({
      input: {
        type: "media",
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        orderBy: "updated_at",
        order: "desc",
      },
    }),
  );

  const upload = useMutation({
    mutationFn: async (file: File): Promise<UploadResponse> => {
      // Phase 1 — ask the server for a presigned PUT URL. This also
      // creates a `draft` entry the client commits to in phase 3.
      const init = (await rpcCall("media/createUploadUrl", {
        filename: file.name,
        contentType: file.type,
        size: file.size,
      })) as {
        uploadUrl: string;
        method: "PUT";
        headers: Record<string, string>;
        mediaId: number;
        storageKey: string;
      };

      // Phase 2 — browser PUTs the bytes directly to storage. Headers
      // returned from phase 1 must be echoed verbatim — they were signed.
      const putRes = await fetch(init.uploadUrl, {
        method: init.method,
        headers: init.headers,
        body: file,
      });
      if (!putRes.ok) {
        throw new Error(`upload_failed_${putRes.status}`);
      }

      // Phase 3 — flip the draft to published, get back the public URL.
      const confirmed = (await rpcCall("media/confirm", {
        id: init.mediaId,
      })) as {
        id: number;
        url: string;
        storageKey: string;
        mime: string;
        size: number;
      };
      return {
        id: confirmed.id,
        slug: String(confirmed.id),
        url: confirmed.url,
        storageKey: confirmed.storageKey,
        mime: confirmed.mime,
        size: confirmed.size,
      };
    },
    onSuccess: () => {
      // Jump back to page 1 so the freshly-uploaded asset (sorted by
      // `updated_at desc`) is in view; uploading from a later page would
      // otherwise hide the new card. Then invalidate the list query so
      // the new asset shows up. Pinning to the exact queryKey here would
      // couple to oRPC's internal serialisation; the predicate form
      // survives library upgrades.
      setPage(0);
      void queryClient.invalidateQueries({
        predicate: (q) =>
          Array.isArray(q.queryKey) &&
          q.queryKey[0] === "entry" &&
          q.queryKey[1] === "list",
      });
    },
  });

  const items: readonly MediaEntry[] =
    list.status === "success" ? list.data : [];
  const hasNext = items.length === PAGE_SIZE;

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
          {items.map((entry) => (
            <MediaCard key={entry.id} entry={entry} />
          ))}
        </div>
      )}

      <Pagination page={page} hasNext={hasNext} onChange={setPage} />

      {upload.error && (
        <div
          role="alert"
          data-testid="media-library-upload-error"
          className="text-destructive flex items-center justify-between gap-3 text-sm"
        >
          <span>
            {upload.error instanceof Error
              ? upload.error.message
              : String(upload.error)}
          </span>
          <button
            type="button"
            data-testid="media-library-upload-error-dismiss"
            onClick={() => upload.reset()}
            className="text-xs underline"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
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

function MediaCard({ entry }: { entry: MediaEntry }): ReactNode {
  const meta = entry.meta as MediaMeta;
  return (
    <article
      data-testid={`media-card-${entry.id}`}
      className="bg-card flex flex-col gap-2 rounded border p-3"
    >
      <div className="bg-muted aspect-square w-full rounded" />
      <div className="truncate text-sm">{entry.title}</div>
      <div className="text-muted-foreground text-xs">
        {meta.mime ?? "—"} · {formatSize(meta.size)}
      </div>
    </article>
  );
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
        Page {page + 1}
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
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
