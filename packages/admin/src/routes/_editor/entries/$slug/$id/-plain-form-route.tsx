import type { PostEditorValues } from "@/components/editor/post-editor-form.js";
import type { MetaFieldServerError } from "@/lib/meta-field-errors.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useCallback, useRef, useState } from "react";
import { PlainFormLayout } from "@/components/editor/plain-form-layout.js";
import { diffMetaBag } from "@/editor/meta-diff.js";
import { PreviewButton } from "@/editor/PreviewButton.js";
import { useRevisionsTrigger } from "@/editor/revisions/use-revisions-trigger.js";
import { useEntryAutosave } from "@/editor/use-entry-autosave.js";
import { entryMetaBoxesForType } from "@/lib/manifest.js";
import { extractMetaFieldErrors } from "@/lib/meta-field-errors.js";
import { orpc } from "@/lib/orpc.js";
import { entryTypeLabel } from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";

import type { ResolvedMeta } from "@plumix/core";
import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import { describeRpcError } from "@plumix/core/admin";

const M = {
  saveFailed: defineMessage({
    id: "editor.entry.edit.saveFailed",
    message: "Couldn't save.",
  }),
} satisfies Record<string, MessageDescriptor>;

// The fields the plain form writes: title and status always, meta as a patch.
interface PlainFormSnapshot {
  readonly title: string;
  readonly status: PostEditorValues["status"];
  readonly meta: ResolvedMeta;
}

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
  const metaBoxes = entryMetaBoxesForType(entryType.name, capabilities);
  // The form and diff baseline share the stored bag, foreign keys included,
  // so a freshly-opened entry diffs empty.
  const seededMeta = entry.meta;
  const initialSnapshot: PlainFormSnapshot = {
    title: entry.title,
    status: entry.status,
    meta: seededMeta,
  };
  const valuesRef = useRef<PlainFormSnapshot>(initialSnapshot);
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );
  const [serverFieldErrors, setServerFieldErrors] = useState<
    readonly MetaFieldServerError[] | null
  >(null);

  const autosave = useEntryAutosave({
    id,
    entryType: entry.type,
    liveUpdatedAt: entry.updatedAt,
    onError: (err) => {
      setServerError(describeRpcError(err, {}, M.saveFailed));
      setServerFieldErrors(extractMetaFieldErrors(err) ?? null);
    },
    onSavingChange: setIsSaving,
    groups: {
      form: {
        initial: initialSnapshot,
        snapshot: () => valuesRef.current,
        // Send only the changed meta keys so untouched foreign keys aren't
        // re-validated (an unregistered one would fail the whole write).
        diff: (saved: PlainFormSnapshot, next: PlainFormSnapshot) => {
          const metaPatch = diffMetaBag(saved.meta, next.meta);
          return {
            title: next.title,
            status: next.status,
            ...(Object.keys(metaPatch).length > 0 ? { meta: metaPatch } : {}),
          };
        },
        commit: (_saved: PlainFormSnapshot, next: PlainFormSnapshot) => next,
        onSaved: () => {
          setServerError(null);
          setServerFieldErrors(null);
          void queryClient.invalidateQueries({
            queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
          });
        },
      },
    },
  });
  const handleValuesChange = (values: PostEditorValues): void => {
    valuesRef.current = {
      title: values.title,
      status: values.status,
      meta: values.meta,
    };
    autosave.schedule.form();
  };

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
  const { trigger: revisionsTrigger } = useRevisionsTrigger({
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
    isSaving || serverError === null ? null : renderLabel(serverError);

  return (
    <PlainFormLayout
      key={String(id)}
      initialValues={initialValues}
      metaBoxes={metaBoxes}
      headline={headline}
      isSubmitting={isSaving}
      serverError={renderedError}
      serverFieldErrors={serverFieldErrors}
      onValuesChange={handleValuesChange}
      revisionsTrigger={revisionsTrigger}
      previewLinkAction={
        entryType.isPublic ? (
          <PreviewButton
            mintPreviewLink={() => orpc.entry.createPreviewLink.call({ id })}
          />
        ) : undefined
      }
      onSubmit={(values) => {
        handleValuesChange(values);
        void autosave.flush();
      }}
    />
  );
}
