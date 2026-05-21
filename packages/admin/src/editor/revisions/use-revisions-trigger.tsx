import type { ReactNode, RefObject } from "react";
import { useMemo } from "react";
import { RevisionsSheet } from "@/editor/revisions/RevisionsSheet.js";
import { orpc } from "@/lib/orpc.js";
import { formatRelativeTime } from "@/lib/relative-time.js";
import { useQueryClient } from "@tanstack/react-query";

interface UseRevisionsTriggerInput {
  readonly entryId: number;
  readonly enabled: boolean;
  // Optimistic-concurrency token source. Both routes mutate the same
  // server-confirmed `updatedAt` they pass through `entry.update`, so
  // the trigger reads from the same ref to send a fresh token on
  // restore.
  readonly liveUpdatedAtRef: RefObject<Date>;
}

// Single chokepoint for the `<RevisionsSheet />` adapter both v1 and
// v2 edit routes mount. Returns null when `enabled` is false so
// callers can drop the trigger straight into the layout's slot.
export function useRevisionsTrigger({
  entryId,
  enabled,
  liveUpdatedAtRef,
}: UseRevisionsTriggerInput): ReactNode {
  const queryClient = useQueryClient();
  return useMemo<ReactNode>(() => {
    if (!enabled) return null;
    return (
      <RevisionsSheet
        entryId={entryId}
        relativeTime={formatRelativeTime}
        fetchPage={({ entryId, cursor }) =>
          orpc.entry.revisions.list.call({ entryId, cursor })
        }
        fetchRevision={async (revisionId) => {
          const rev = await orpc.entry.revisions.get.call({ revisionId });
          return {
            title: rev.title,
            slug: rev.slug,
            excerpt: rev.excerpt,
            content: rev.content,
            meta: rev.meta,
          };
        }}
        fetchCurrent={async (entryId) => {
          const current = await orpc.entry.get.call({ id: entryId });
          return {
            title: current.title,
            slug: current.slug,
            excerpt: current.excerpt,
            content: current.content,
            meta: current.meta,
          };
        }}
        onRestore={async (revisionId) => {
          const restored = await orpc.entry.revisions.restore.call({
            revisionId,
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          liveUpdatedAtRef.current = restored.updatedAt;
          await queryClient.invalidateQueries({
            queryKey: orpc.entry.get.queryOptions({ input: { id: entryId } })
              .queryKey,
          });
        }}
      />
    );
  }, [entryId, enabled, liveUpdatedAtRef, queryClient]);
}
