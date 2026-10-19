import type { ConflictDialogState } from "@/editor/conflict-dialog.js";
import type { EditingCopy } from "@/editor/editing-copy.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useReducer, useRef, useState } from "react";
import { MetaBoxField } from "@/components/meta-box/meta-box-field.js";
import { useVisibleFields } from "@/components/meta-box/use-visible-fields.js";
import { classifyAutosaveError } from "@/editor/autosave.js";
import { conflictDialog, editingElsewhere } from "@/editor/conflict-dialog.js";
import { editorLeaseMode } from "@/editor/edit-lease.js";
import { EditLeaseBanner } from "@/editor/EditLeaseBanner.js";
import { EntryConflictDialog } from "@/editor/EntryConflictDialog.js";
import { useSettingsGroupLease } from "@/editor/use-edit-lease.js";
import {
  applyMetaFieldErrors,
  extractMetaFieldErrors,
  useMetaFieldMessage,
} from "@/lib/meta-field-errors.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import type { ResolvedMeta } from "@plumix/core";
import type { SettingsGroupManifestEntry } from "@plumix/core/manifest";
import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import { Button } from "@plumix/admin-ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";
import { Form } from "@plumix/admin-ui/form";
import { describeRpcError } from "@plumix/core/admin";
import { seedFromMetaBoxes } from "@plumix/core/manifest";

const M = {
  saved: defineMessage({
    id: "settings.page.saved",
    message: "Saved.",
  }),
  saveFailed: defineMessage({
    id: "settings.page.saveFailed",
    message: "Couldn't save settings.",
  }),
} satisfies Record<string, MessageDescriptor>;

const SETTINGS_EDITING_COPY: EditingCopy = {
  conflictTitle: defineMessage({
    id: "settings.conflict.title",
    message: "These settings changed since you opened them",
  }),
  heldBy: defineMessage({
    id: "settings.lease.heldBy",
    message: "{name} is editing these settings (since {time})",
    comment:
      "name: the editing user's display name or email; time: a formatted date and time",
  }),
  lost: defineMessage({
    id: "settings.lease.lost",
    message:
      "{name} took over editing these settings at {time}. Your unsaved changes are shown here but weren't saved.",
    comment: "name: the user who took over; time: a formatted date and time",
  }),
};

/**
 * Split out of `$page.tsx` so a test can mount one group's card without the
 * file-based route tree.
 */
export function SettingsGroupCard({
  group,
  userId,
}: {
  readonly group: SettingsGroupManifestEntry;
  readonly userId: number;
}): ReactNode {
  const { i18n } = useLingui();
  const renderLabel = useLabel();
  const resolveMessage = useMetaFieldMessage();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );
  const [saveNotice, setSaveNotice] = useState<MessageDescriptor | null>(null);

  const getOptions = orpc.settings.get.queryOptions({
    input: { group: group.name },
  });
  const { data: stored } = useSuspenseQuery(getOptions);
  // The copy this card saves from. A refetch for a comparison must not move
  // it, or the next save would overwrite what the author never saw.
  const [etag, setEtag] = useState(stored.etag);

  const form = useForm({
    defaultValues: seedFromMetaBoxes([group], stored.values),
  });
  // The settings card owns its form (no ancestor provider), so the
  // visibility hook needs the control handed over explicitly.
  const visibleFields = useVisibleFields(group.fields, {
    control: form.control,
  });

  const [conflict, dispatchConflict] = useReducer(conflictDialog, {
    open: false,
  } satisfies ConflictDialogState);
  const theirsQuery = useQuery({
    queryKey: [
      "settings.conflict",
      group.name,
      conflict.open && conflict.conflict.etag,
    ],
    queryFn: () => orpc.settings.get.call({ group: group.name }),
    enabled: conflict.open,
  });

  // The lease is held only while the author is working in this card.
  const formRef = useRef<HTMLFormElement>(null);
  const [engaged, setEngaged] = useState(false);
  const lease = useSettingsGroupLease(group.name, engaged);
  const leaseMode = editorLeaseMode(lease.state);
  const notice = leaseMode.mode === "readOnly" ? leaseMode.notice : undefined;
  const disengageUnlessFocused = (): void => {
    if (!formRef.current?.contains(document.activeElement)) setEngaged(false);
  };

  const save = useMutation({
    mutationFn: (input: { values: ResolvedMeta; ifMatch: string }) =>
      orpc.settings.upsert.call({ group: group.name, ...input }),
    onMutate: () => {
      setServerError(null);
      setSaveNotice(null);
    },
    onSuccess: (fresh) => {
      setEtag(fresh.etag);
      // Re-seed from the server's post-sanitize bag so the form reflects
      // any trimming / coercion the server applied.
      form.reset(seedFromMetaBoxes([group], fresh.values));
      queryClient.setQueryData(getOptions.queryKey, fresh);
      setSaveNotice(M.saved);
      disengageUnlessFocused();
    },
    onError: (err) => {
      // Path-addressed field rejections render inline on the offending
      // inputs; everything else keeps the banner. The settings card keeps
      // its fields at the RHF root, so the base path is empty.
      const fieldErrors = extractMetaFieldErrors(err);
      if (fieldErrors) {
        applyMetaFieldErrors(form.setError, "", fieldErrors, resolveMessage);
        return;
      }
      const outcome = classifyAutosaveError(err);
      if (outcome.kind === "conflict") {
        dispatchConflict({ type: "conflict", conflict: outcome.conflict });
        return;
      }
      if (outcome.kind === "locked") {
        lease.lose(outcome.locked);
        return;
      }
      setServerError(describeRpcError(err, {}, M.saveFailed));
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate({ values, ifMatch: etag });
  });

  const handleKeepMine = (): void => {
    if (!conflict.open) return;
    dispatchConflict({ type: "keepMine" });
    save.mutate({ values: form.getValues(), ifMatch: conflict.conflict.etag });
  };
  const loadSaved = async (): Promise<void> => {
    const saved = await queryClient.query({ ...getOptions, staleTime: 0 });
    setEtag(saved.etag);
    form.reset(seedFromMetaBoxes([group], saved.values));
    disengageUnlessFocused();
  };
  const handleLoadTheirs = (): void => {
    dispatchConflict({ type: "loadTheirs" });
    void loadSaved();
  };
  const takeOver = useMutation({
    mutationFn: lease.takeOver,
    onSuccess: loadSaved,
  });
  const handleBack = (): void => {
    form.reset(seedFromMetaBoxes([group], stored.values));
    setEngaged(false);
  };

  return (
    // Container-query root so the inner grid's col-span classes resolve
    // against the card's own width — consistent layout regardless of
    // whether the page route is full-width or narrow.
    <Card
      className="@container"
      data-testid={`settings-group-card-${group.name}`}
    >
      <EntryConflictDialog
        copy={SETTINGS_EDITING_COPY}
        open={conflict.open}
        changedAt={conflict.open ? (conflict.conflict.updatedAt ?? null) : null}
        editingElsewhere={
          conflict.open
            ? editingElsewhere(conflict.conflict, userId)
            : undefined
        }
        mineSnapshot={conflict.open ? form.getValues() : null}
        theirsSnapshot={theirsQuery.data?.values ?? null}
        onKeepMine={handleKeepMine}
        onLoadTheirs={handleLoadTheirs}
      />
      {notice ? (
        <EditLeaseBanner
          copy={SETTINGS_EDITING_COPY}
          notice={notice}
          onTakeOver={() => takeOver.mutate()}
          isTakingOver={takeOver.isPending}
          onBack={handleBack}
        />
      ) : null}
      <Form {...form}>
        {/* <form> interposes between <Card> and its children, so it must carry
            Card's own flex column gap or the sections collapse together. */}
        <form
          ref={formRef}
          onSubmit={onSubmit}
          onFocus={() => setEngaged(true)}
          onBlur={(event) => {
            const leftCard = !event.currentTarget.contains(event.relatedTarget);
            if (leftCard && !form.formState.isDirty && !notice) {
              setEngaged(false);
            }
          }}
          className="flex flex-col gap-6"
        >
          <CardHeader>
            <CardTitle>
              <h2
                className="text-lg font-semibold"
                data-testid={`settings-group-heading-${group.name}`}
              >
                {renderLabel(group.label)}
              </h2>
            </CardTitle>
            {group.description ? (
              <CardDescription>
                {renderLabel(group.description)}
              </CardDescription>
            ) : null}
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-12 gap-4">
              {visibleFields.map((field) => (
                <MetaBoxField
                  key={field.key}
                  field={field}
                  name={field.key}
                  disabled={save.isPending || notice !== undefined}
                  span={field.span ?? 12}
                />
              ))}
            </div>

            {serverError ? (
              <Alert
                variant="destructive"
                role="alert"
                data-testid={`settings-server-error-${group.name}`}
              >
                <AlertDescription>
                  {i18n._(serverError.id, undefined, {
                    message: serverError.message,
                  })}
                </AlertDescription>
              </Alert>
            ) : null}

            {saveNotice ? (
              <Alert
                role="status"
                aria-live="polite"
                data-testid={`settings-save-notice-${group.name}`}
              >
                <AlertDescription>
                  {i18n._(saveNotice.id, undefined, {
                    message: saveNotice.message,
                  })}
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
          <div className="flex justify-end px-6">
            <Button
              type="submit"
              disabled={save.isPending || notice !== undefined}
              data-testid={`settings-submit-${group.name}`}
            >
              {save.isPending ? (
                <Trans id="settings.page.submit.pending" message="Saving…" />
              ) : (
                <Trans id="settings.page.submit.idle" message="Save changes" />
              )}
            </Button>
          </div>
        </form>
      </Form>
    </Card>
  );
}
