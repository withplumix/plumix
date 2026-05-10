import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import { useInfiniteQuery } from "@tanstack/react-query";

export interface AuditLogRowDTO {
  readonly id: number;
  readonly occurredAt: string;
  readonly event: string;
  readonly subjectType: string;
  readonly subjectId: string;
  readonly subjectLabel: string;
  readonly actorId: number | null;
  readonly actorLabel: string | null;
  readonly properties: Record<string, unknown>;
}

export interface AuditLogFilter {
  readonly actorId?: number;
  readonly subjectType?: string;
  readonly subjectId?: string;
  readonly eventPrefix?: string;
  readonly occurredAfter?: number;
  readonly occurredBefore?: number;
}

interface AuditLogPage {
  readonly rows: readonly AuditLogRowDTO[];
  readonly nextCursor: string | null;
}

interface ListInput extends AuditLogFilter {
  readonly limit?: number;
  readonly cursor?: string;
}

const AUDIT_LOG_LIST_KEY = ["auditLog", "list"] as const;

async function rpcCall<TOutput>(
  procedure: string,
  input: unknown = {},
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

export function useAuditLogList(
  filter: AuditLogFilter = {},
): UseInfiniteQueryResult<{
  pages: AuditLogPage[];
  pageParams: (string | undefined)[];
}> {
  return useInfiniteQuery({
    queryKey: [...AUDIT_LOG_LIST_KEY, filter],
    queryFn: ({ pageParam }) => {
      const input: ListInput =
        pageParam === undefined
          ? { ...filter }
          : { ...filter, cursor: pageParam };
      return rpcCall<AuditLogPage>("auditLog/list", input);
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });
}

export type DateRangePreset = "today" | "last7" | "last30" | "custom";

/**
 * Convert a UI preset into the epoch-second pair the RPC accepts. All
 * presets are inclusive on both ends and computed against `now`.
 *
 * - `today`: from 00:00 UTC of the current day → now.
 * - `last7` / `last30`: rolling N-day windows, ending at `now`.
 * - `custom`: returns `{}` — caller supplies the bounds explicitly.
 */
export function presetToRange(
  preset: DateRangePreset,
  now: Date = new Date(),
): { occurredAfter?: number; occurredBefore?: number } {
  if (preset === "custom") return {};
  const occurredBefore = Math.floor(now.getTime() / 1000);
  if (preset === "today") {
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    return {
      occurredAfter: Math.floor(start.getTime() / 1000),
      occurredBefore,
    };
  }
  const days = preset === "last7" ? 7 : 30;
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  return {
    occurredAfter: Math.floor(start.getTime() / 1000),
    occurredBefore,
  };
}
