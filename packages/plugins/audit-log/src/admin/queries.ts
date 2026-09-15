import type { UseInfiniteQueryResult } from "@tanstack/react-query";
import type { PluginRpcInputs, PluginRpcOutputs } from "plumix/admin";
import { useInfiniteQuery } from "@tanstack/react-query";
import { createPluginRpcClient } from "plumix/admin";

import type { AuditLogRouter } from "../rpc.js";

const rpc = createPluginRpcClient<AuditLogRouter>("audit_log");

type AuditLogPage = PluginRpcOutputs<AuditLogRouter>["list"];
type ListInput = NonNullable<PluginRpcInputs<AuditLogRouter>["list"]>;

export type AuditLogRowDTO = AuditLogPage["rows"][number];
export type AuditLogFilter = Omit<ListInput, "limit" | "cursor">;

const AUDIT_LOG_LIST_KEY = ["auditLog", "list"] as const;

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
      return rpc.list(input);
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
