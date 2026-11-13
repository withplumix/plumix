import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { MetaBoxField } from "@/components/meta-box/meta-box-field.js";
import { useVisibleFields } from "@/components/meta-box/use-visible-fields.js";
import { useEditingCopy } from "@/editor/use-editing-copy.js";
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
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import type { ResolvedMeta } from "@plumix/core";
import type { EditingCopy } from "@plumix/core/admin";
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

  const form = useForm({
    defaultValues: seedFromMetaBoxes([group], stored.values),
  });
  // The settings card owns its form (no ancestor provider), so the
  // visibility hook needs the control handed over explicitly.
  const visibleFields = useVisibleFields(group.fields, {
    control: form.control,
  });

  // The lease is held only while the author is working in this card.
  const formRef = useRef<HTMLFormElement>(null);
  const [engaged, setEngaged] = useState(false);
  const disengageUnlessFocused = (): void => {
    if (!formRef.current?.contains(document.activeElement)) setEngaged(false);
  };

  const editing = useEditingCopy({
    kind: "settings",
    id: group.name,
    etag: stored.etag,
    active: engaged,
    userId,
    copy: SETTINGS_EDITING_COPY,
    save: async (ifMatch, values: ResolvedMeta) => {
      const fresh = await orpc.settings.upsert.call({
        group: group.name,
        values,
        ifMatch,
      });
      // Re-seed from the server's post-sanitize bag so the form reflects
      // any trimming / coercion the server applied.
      form.reset(seedFromMetaBoxes([group], fresh.values));
      queryClient.setQueryData(getOptions.queryKey, fresh);
      setSaveNotice(M.saved);
      disengageUnlessFocused();
      return fresh;
    },
    readSaved: async () =>
      (await orpc.settings.get.call({ group: group.name })).values,
    reload: async () => {
      const saved = await queryClient.query({ ...getOptions, staleTime: 0 });
      form.reset(seedFromMetaBoxes([group], saved.values));
      disengageUnlessFocused();
      return saved.etag;
    },
    onFailed: (err) => {
      // Path-addressed field rejections render inline on the offending
      // inputs; everything else keeps the banner. The settings card keeps
      // its fields at the RHF root, so the base path is empty.
      const fieldErrors = extractMetaFieldErrors(err);
      if (fieldErrors) {
        applyMetaFieldErrors(form.setError, "", fieldErrors, resolveMessage);
        return;
      }
      setServerError(describeRpcError(err, {}, M.saveFailed));
    },
    onBack: () => {
      form.reset(seedFromMetaBoxes([group], stored.values));
      setEngaged(false);
    },
  });
  // Focusing the card is what asks for the lease, so locking it while the
  // lease is asked for would take away the focus that asked.
  const locked = editing.readOnly && editing.mode !== "loading";

  const save = useMutation({
    mutationFn: (values: ResolvedMeta) => editing.save(values),
    onMutate: () => {
      setServerError(null);
      setSaveNotice(null);
    },
  });

  const onSubmit = form.handleSubmit((values) => {
    save.mutate(values);
  });

  return (
    // Container-query root so the inner grid's col-span classes resolve
    // against the card's own width — consistent layout regardless of
    // whether the page route is full-width or narrow.
    <Card
      className="@container"
      data-testid={`settings-group-card-${group.name}`}
    >
      {editing.dialog}
      {editing.banner}
      <Form {...form}>
        {/* <form> interposes between <Card> and its children, so it must carry
            Card's own flex column gap or the sections collapse together. */}
        <form
          ref={formRef}
          onSubmit={onSubmit}
          onFocus={() => setEngaged(true)}
          onBlur={(event) => {
            const leftCard = !event.currentTarget.contains(event.relatedTarget);
            if (
              leftCard &&
              !form.formState.isDirty &&
              editing.mode !== "readOnly"
            ) {
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
                  disabled={save.isPending || locked}
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
              disabled={save.isPending || locked}
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
