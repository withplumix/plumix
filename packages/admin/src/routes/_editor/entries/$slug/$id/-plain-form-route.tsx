import type { PostEditorValues } from "@/components/editor/post-editor-form.js";
import type { EditorLeaseMode } from "@/editor/edit-lease.js";
import type { EditLease } from "@/editor/use-edit-lease.js";
import type { MetaFieldServerError } from "@/lib/meta-field-errors.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useCallback, useReducer, useRef, useState } from "react";
import { PlainFormLayout } from "@/components/editor/plain-form-layout.js";
import { conflictDialog, editingElsewhere } from "@/editor/conflict-dialog.js";
import { EditLeaseBanner } from "@/editor/EditLeaseBanner.js";
import { EntryConflictDialog } from "@/editor/EntryConflictDialog.js";
import { diffMetaBag } from "@/editor/meta-diff.js";
import { PreviewButton } from "@/editor/PreviewButton.js";
import { useRevisionsTrigger } from "@/editor/revisions/use-revisions-trigger.js";
import { useEntryAutosave } from "@/editor/use-entry-autosave.js";
import { ENTRIES_LIST_DEFAULT_SEARCH } from "@/lib/entries.js";
import { entryMetaBoxesForType } from "@/lib/manifest.js";
import { extractMetaFieldErrors } from "@/lib/meta-field-errors.js";
import { orpc } from "@/lib/orpc.js";
import { entryTypeLabel } from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
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

/**
 * The fields the plain form writes: title and status always, meta as a patch.
 */
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
  /** Remount on the saved entry, after the author loads theirs. */
  readonly onReseed: () => void;
  readonly userId: number;
  readonly lease: EditLease;
  readonly leaseMode: EditorLeaseMode;
}

export function PlainFormRouteInner({
  entryType,
  id,
  supportsRevisions,
  capabilities,
  onReseed,
  userId,
  lease,
  leaseMode,
}: PlainFormRouteInnerProps): ReactNode {
  const renderLabel = useLabel();
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id } }),
  );
  const queryClient = useQueryClient();
  const metaBoxes = entryMetaBoxesForType(entryType.name, capabilities);
  const initialSnapshot: PlainFormSnapshot = {
    title: entry.title,
    status: entry.status,
    meta: entry.meta,
  };
  const valuesRef = useRef<PlainFormSnapshot>(initialSnapshot);
  const [isSaving, setIsSaving] = useState(false);
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );
  const [serverFieldErrors, setServerFieldErrors] = useState<
    readonly MetaFieldServerError[] | null
  >(null);

  const [conflict, dispatchConflict] = useReducer(conflictDialog, {
    open: false,
  });
  const [conflictMine, setConflictMine] = useState<PlainFormSnapshot | null>(
    null,
  );
  const autosave = useEntryAutosave({
    id,
    etag: entry.etag,
    onConflict: (next) => {
      // The author's copy as it stood when the save was refused.
      setConflictMine(valuesRef.current);
      dispatchConflict({ type: "conflict", conflict: next });
    },
    onLocked: lease.lose,
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
  const entryQueryKey = orpc.entry.get.queryOptions({ input: { id } }).queryKey;
  // The entry as the conflicting write left it, fetched fresh per conflict.
  const theirsQuery = useQuery({
    queryKey: ["entry.conflict", id, conflict.open && conflict.conflict.etag],
    queryFn: () => orpc.entry.get.call({ id }),
    enabled: conflict.open,
  });
  const handleKeepMine = (): void => {
    if (!conflict.open) return;
    dispatchConflict({ type: "keepMine" });
    void autosave.keepMine(conflict.conflict.etag);
  };
  const handleLoadTheirs = (): void => {
    dispatchConflict({ type: "loadTheirs" });
    // Drop the author's unsaved edits, then remount on the saved entry.
    autosave.cancel();
    void queryClient
      .invalidateQueries({ queryKey: entryQueryKey })
      .then(onReseed);
  };

  // Remount on the entry as the previous holder left it.
  const takeOver = useMutation({
    mutationFn: lease.takeOver,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: entryQueryKey }).then(onReseed),
  });
  const handleBack = (): void => {
    void navigate({
      to: "/entries/$slug",
      params: { slug: entryType.adminSlug },
      search: ENTRIES_LIST_DEFAULT_SEARCH,
    });
  };

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
    meta: entry.meta,
    terms: {},
    parentId: entry.parentId,
  };

  const headline =
    entry.title.trim() === ""
      ? renderLabel(entryTypeLabel(entryType, "editItem"))
      : entry.title;
  const renderedError =
    isSaving || serverError === null ? null : renderLabel(serverError);

  return (
    <>
      <EntryConflictDialog
        open={conflict.open}
        changedAt={conflict.open ? (conflict.conflict.updatedAt ?? null) : null}
        editingElsewhere={
          conflict.open
            ? editingElsewhere(conflict.conflict, userId)
            : undefined
        }
        mineSnapshot={conflictMine}
        theirsSnapshot={
          theirsQuery.data
            ? {
                title: theirsQuery.data.title,
                status: theirsQuery.data.status,
                meta: theirsQuery.data.meta,
              }
            : null
        }
        onKeepMine={handleKeepMine}
        onLoadTheirs={handleLoadTheirs}
      />
      {leaseMode.mode === "readOnly" ? (
        <EditLeaseBanner
          notice={leaseMode.notice}
          onTakeOver={() => takeOver.mutate()}
          isTakingOver={takeOver.isPending}
          onBack={handleBack}
        />
      ) : null}
      {/* A disabled fieldset disables every control in the form at once. */}
      <fieldset
        disabled={leaseMode.mode === "readOnly"}
        className="contents"
        data-testid="plain-form-fieldset"
      >
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
                mintPreviewLink={() =>
                  orpc.entry.createPreviewLink.call({ id })
                }
              />
            ) : undefined
          }
          onSubmit={(values) => {
            handleValuesChange(values);
            void autosave.flush();
          }}
        />
      </fieldset>
    </>
  );
}
