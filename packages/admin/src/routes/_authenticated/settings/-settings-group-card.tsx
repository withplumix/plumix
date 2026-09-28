import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { MetaBoxField } from "@/components/meta-box/meta-box-field.js";
import { metaBoxFieldColSpanClass } from "@/components/meta-box/meta-box-grid.js";
import { useVisibleFields } from "@/components/meta-box/use-visible-fields.js";
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

// Split out of `$page.tsx` so a test can mount one group's card without the
// file-based route tree.
export function SettingsGroupCard({
  group,
}: {
  readonly group: SettingsGroupManifestEntry;
}): ReactNode {
  const { i18n } = useLingui();
  const renderLabel = useLabel();
  const resolveMessage = useMetaFieldMessage();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );
  const [saveNotice, setSaveNotice] = useState<MessageDescriptor | null>(null);

  const { data: stored } = useSuspenseQuery(
    orpc.settings.get.queryOptions({ input: { group: group.name } }),
  );

  // Initial form state: stored value when present, field default when
  // not. Values are `unknown` both ways — `MetaBoxField` renders the
  // right input for each field's `inputType` and hands back the coerced
  // value through rhf's Controller.
  const form = useForm({
    defaultValues: seedFromMetaBoxes([group], stored),
  });
  // The settings card owns its form (no ancestor provider), so the
  // visibility hook needs the control handed over explicitly.
  const visibleFields = useVisibleFields(group.fields, {
    control: form.control,
  });

  const save = useMutation({
    mutationFn: (next: ResolvedMeta) =>
      orpc.settings.upsert.call({ group: group.name, values: next }),
    onMutate: () => {
      setServerError(null);
      setSaveNotice(null);
    },
    onSuccess: async (fresh) => {
      // Re-seed from the server's post-sanitize bag so the form reflects
      // any trimming / coercion the server applied.
      form.reset(seedFromMetaBoxes([group], fresh));
      await queryClient.invalidateQueries({
        queryKey: orpc.settings.get.queryOptions({
          input: { group: group.name },
        }).queryKey,
      });
      setSaveNotice(M.saved);
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
      setServerError(describeRpcError(err, {}, M.saveFailed));
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
      <Form {...form}>
        {/* <form> interposes between <Card> and its children, so it must carry
            Card's own flex column gap or the sections collapse together. */}
        <form onSubmit={onSubmit} className="flex flex-col gap-6">
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
                  disabled={save.isPending}
                  className={metaBoxFieldColSpanClass(field.span)}
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
              disabled={save.isPending}
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
