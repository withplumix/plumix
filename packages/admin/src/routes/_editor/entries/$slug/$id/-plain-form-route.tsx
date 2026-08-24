import type { SaveQueue } from "@/editor/save-queue.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { PlainFormLayout } from "@/components/editor/plain-form-layout.js";
import { classifyAutosaveError } from "@/editor/autosave.js";
import { diffMetaBag } from "@/editor/meta-diff.js";
import { PreviewButton } from "@/editor/PreviewButton.js";
import { useRevisionsTrigger } from "@/editor/revisions/use-revisions-trigger.js";
import { createSaveQueue } from "@/editor/save-queue.js";
import { seedEntryMetaForm } from "@/editor/seed-entry-meta.js";
import { entryMetaBoxesForType } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { entryTypeLabel } from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import type { ResolvedMeta } from "@plumix/core";
import type { Label } from "@plumix/core/i18n";
import type { EntryTypeManifestEntry } from "@plumix/core/manifest";

const M = {
  saveFailed: defineMessage({
    id: "editor.entry.edit.saveFailed",
    message: "Couldn't save.",
  }),
} satisfies Record<string, MessageDescriptor>;

interface PlainFormRouteInnerProps {
  readonly entryType: EntryTypeManifestEntry;
  readonly id: number;
  readonly supportsRevisions: boolean;
  readonly capabilities: readonly string[];
}

export function PlainFormRouteInner({
  entryType,
  id,
  supportsRevisions,
  capabilities,
}: PlainFormRouteInnerProps): ReactNode {
  const renderLabel = useLabel();
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id } }),
  );
  const queryClient = useQueryClient();
  const liveUpdatedAtRef = useRef<Date>(entry.updatedAt);
  // Serializes writes so concurrent autosaves/submits can't race the shared
  // optimistic token into `409` conflicts and drop edits.
  const saveQueueRef = useRef<SaveQueue | null>(null);
  saveQueueRef.current ??= createSaveQueue();
  const saveQueue = saveQueueRef.current;
  const metaBoxes = entryMetaBoxesForType(entryType.name, capabilities);
  // Defaults for display: the form and diff baseline share this value — see
  // `seedEntryMetaForm`.
  const seededMeta = seedEntryMetaForm(metaBoxes, entry.meta);
  // Last meta bag we persisted — autosave diffs against it and sends only the
  // changed keys, so untouched foreign keys aren't re-validated on every write.
  const lastSavedMetaRef = useRef<Record<string, unknown>>(seededMeta);
  // String branch carries plugin-author `err.message` verbatim; the
  // descriptor branch surfaces the localized fallback.
  const [serverError, setServerError] = useState<Label | null>(null);

  const updateMutation = useMutation({
    mutationFn: async (values: {
      title: string;
      status: string;
      meta: ResolvedMeta;
    }) => {
      // Send only the changed meta keys so untouched foreign keys aren't
      // re-validated (an unregistered one would fail the whole write).
      const metaPatch = diffMetaBag(lastSavedMetaRef.current, values.meta);
      // Read the token and re-anchor it inside the serialized task so each
      // queued write sees the post-write value, never a stale one.
      const writeOnce = () =>
        saveQueue.run(async () => {
          const res = await orpc.entry.update.call({
            id,
            title: values.title,
            status: values.status as never,
            ...(Object.keys(metaPatch).length > 0 ? { meta: metaPatch } : {}),
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          liveUpdatedAtRef.current = res.updatedAt;
          return res;
        });
      const commit = async () => {
        const res = await writeOnce();
        lastSavedMetaRef.current = values.meta;
        return res;
      };
      try {
        return await commit();
      } catch (err) {
        // A recoverable stale-token conflict re-anchors and retries once, so a
        // benign concurrency bump doesn't surface as a save failure or drop the
        // edit.
        const outcome = await classifyAutosaveError(err, queryClient, id);
        if (outcome.kind !== "recovered") throw err;
        if (outcome.updatedAt) liveUpdatedAtRef.current = outcome.updatedAt;
        return await commit();
      }
    },
    onSuccess: async () => {
      setServerError(null);
      await queryClient.invalidateQueries({
        queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
      });
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : M.saveFailed);
    },
  });

  // Bound to the `/edit` route for search-schema inference: this component is
  // the non-editor branch of that route, so its `revision` search param is the
  // canonical one to merge into.
  const navigate = useNavigate({
    from: "/entries/$slug/$id/edit",
  });
  const handlePreview = useCallback(
    (revisionId: number): void => {
      void navigate({ search: (prev) => ({ ...prev, revision: revisionId }) });
    },
    [navigate],
  );
  const revisionsTrigger = useRevisionsTrigger({
    entryId: id,
    enabled: supportsRevisions,
    onPreview: handlePreview,
  });

  const initialValues = {
    title: entry.title,
    slug: entry.slug,
    content: entry.content,
    excerpt: entry.excerpt ?? "",
    status: entry.status,
    meta: seededMeta,
    terms: {},
    parentId: entry.parentId,
  };

  // Use the entry's title as the headline when available; cascade
  // through the type's `labels.editItem` ("Edit Post" / "Edit Page")
  // otherwise. Substitution-free — the per-type label declares the
  // noun explicitly so DE/RU/PL/UK/AR morphology stays correct.
  const headline =
    entry.title.trim() === ""
      ? renderLabel(entryTypeLabel(entryType, "editItem"))
      : entry.title;
  const renderedError =
    updateMutation.isPending || serverError === null
      ? null
      : renderLabel(serverError);

  return (
    <PlainFormLayout
      key={String(id)}
      initialValues={initialValues}
      metaBoxes={metaBoxes}
      headline={headline}
      isSubmitting={updateMutation.isPending}
      serverError={renderedError}
      autosaveMs={500}
      revisionsTrigger={revisionsTrigger}
      previewLinkAction={
        entryType.isPublic === false ? undefined : (
          <PreviewButton
            mintPreviewLink={() => orpc.entry.createPreviewLink.call({ id })}
          />
        )
      }
      onSubmit={(values) =>
        updateMutation.mutate({
          title: values.title,
          status: values.status,
          meta: values.meta,
        })
      }
    />
  );
}
