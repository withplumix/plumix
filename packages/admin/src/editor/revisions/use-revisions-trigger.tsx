import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { RevisionsSheet } from "@/editor/revisions/RevisionsSheet.js";
import { orpc } from "@/lib/orpc.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useQueryClient } from "@tanstack/react-query";

interface UseRevisionsTriggerInput {
  readonly entryId: number;
  readonly enabled: boolean;
  // Trigger presentation, forwarded to the sheet. `text` (default) for the
  // plain-form editor; `icon` for the visual editor's icon header.
  readonly triggerVariant?: "text" | "icon";
  // Fires when a row body is clicked — caller navigates the editor to
  // preview the chosen revision (`?revision=<id>`). Restore now lives
  // on the preview banner, not the sheet, so the sheet no longer
  // owns the optimistic-concurrency token.
  readonly onPreview: (revisionId: number) => void;
}

export interface RevisionsTrigger {
  // The header affordance; null when the entry type has no revisions, so
  // callers can drop it straight into the layout's slot.
  readonly trigger: ReactNode;
  // Opens the same sheet without its trigger being clicked (the editor
  // command palette). Undefined when the entry type has no revisions.
  readonly openRevisions?: () => void;
}

// Single chokepoint for the `<RevisionsSheet />` adapter both v1 and
// v2 edit routes mount. The open state lives here rather than in the
// sheet so the command palette can raise it too.
export function useRevisionsTrigger({
  entryId,
  enabled,
  onPreview,
  triggerVariant,
}: UseRevisionsTriggerInput): RevisionsTrigger {
  const queryClient = useQueryClient();
  const { formatRelative } = useFormatters();
  const [open, setOpen] = useState(false);
  const openRevisions = useCallback(() => {
    setOpen(true);
  }, []);
  const trigger = useMemo<ReactNode>(() => {
    if (!enabled) return null;
    return (
      <RevisionsSheet
        entryId={entryId}
        triggerVariant={triggerVariant}
        open={open}
        onOpenChange={setOpen}
        relativeTime={formatRelative}
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
  }, [
    entryId,
    enabled,
    onPreview,
    triggerVariant,
    queryClient,
    formatRelative,
    open,
  ]);
  return { trigger, openRevisions: enabled ? openRevisions : undefined };
}
