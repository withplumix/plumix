import type { ReactNode } from "react";
import { useMemo } from "react";
import { RevisionsSheet } from "@/editor/revisions/RevisionsSheet.js";
import { orpc } from "@/lib/orpc.js";
import { formatRelativeTime } from "@/lib/relative-time.js";
import { useQueryClient } from "@tanstack/react-query";

interface UseRevisionsTriggerInput {
  readonly entryId: number;
  readonly enabled: boolean;
  // Fires when a row body is clicked — caller navigates the editor to
  // preview the chosen revision (`?revision=<id>`). Restore now lives
  // on the preview banner, not the sheet, so the sheet no longer
  // owns the optimistic-concurrency token.
  readonly onPreview: (revisionId: number) => void;
}

// Single chokepoint for the `<RevisionsSheet />` adapter both v1 and
// v2 edit routes mount. Returns null when `enabled` is false so
// callers can drop the trigger straight into the layout's slot.
export function useRevisionsTrigger({
  entryId,
  enabled,
  onPreview,
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
        onPreview={onPreview}
        onSaveMessage={async ({ revisionId, message }) => {
          await orpc.entry.revisions.setMessage.call({ revisionId, message });
          // Invalidate the infinite-list query so the row re-renders
          // with the new message. Cheap to refetch — at most 25 rows
          // and the user just clicked Save so they're focused on the
          // sheet.
          await queryClient.invalidateQueries({
            queryKey: ["entry.revisions", entryId],
          });
        }}
      />
    );
  }, [entryId, enabled, onPreview, queryClient]);
}
