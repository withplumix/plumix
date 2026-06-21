import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { PlainFormLayout } from "@/components/editor/plain-form-layout.js";
import { PreviewButton } from "@/editor/PreviewButton.js";
import { useRevisionsTrigger } from "@/editor/revisions/use-revisions-trigger.js";
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
  // String branch carries plugin-author `err.message` verbatim; the
  // descriptor branch surfaces the localized fallback.
  const [serverError, setServerError] = useState<Label | null>(null);

  const metaBoxes = entryMetaBoxesForType(entryType.name, capabilities);

  const updateMutation = useMutation({
    mutationFn: (values: {
      title: string;
      status: string;
      meta: Record<string, unknown>;
    }) =>
      orpc.entry.update.call({
        id,
        title: values.title,
        status: values.status as never,
        meta: values.meta,
        expectedLiveUpdatedAt: liveUpdatedAtRef.current,
      }),
    onSuccess: async (updated) => {
      setServerError(null);
      liveUpdatedAtRef.current = updated.updatedAt;
      await queryClient.invalidateQueries({
        queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
      });
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : M.saveFailed);
    },
  });

  // Bound to the bespoke `/editor` route for search-schema inference: this
  // component is the non-editor branch of that route (and, until it's deleted,
  // the legacy `/edit` route), and every nav target now points at `/editor`, so
  // its `revision` search param is the canonical one to merge into.
  const navigate = useNavigate({
    from: "/entries/$slug/$id/editor",
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
    meta: entry.meta,
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
