import type { MessageDescriptor } from "@lingui/core";
import type { ReactElement, ReactNode } from "react";
import { useEffect, useRef } from "react";
import { MetaBoxField } from "@/components/meta-box/meta-box-field.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { useLabel } from "@/lib/use-label.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useForm, useWatch } from "react-hook-form";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";

import type { PostEditorValues } from "./post-editor-form.js";
import { postEditorSchema } from "./post-editor-form.js";

type SaveStatus = "saved" | "saving" | "error";

const M = {
  statusSaved: defineMessage({
    id: "editor.plainForm.status.saved",
    message: "Saved",
  }),
  statusSaving: defineMessage({
    id: "editor.plainForm.status.saving",
    message: "Saving...",
  }),
  statusError: defineMessage({
    id: "editor.plainForm.status.error",
    message: "Failed to save",
  }),
  titlePlaceholder: defineMessage({
    id: "editor.plainForm.titlePlaceholder",
    message: "Untitled",
  }),
} satisfies Record<string, MessageDescriptor>;

interface PlainFormLayoutProps {
  readonly initialValues: PostEditorValues;
  readonly metaBoxes: readonly EntryMetaBoxManifestEntry[];
  readonly headline: string;
  readonly isSubmitting: boolean;
  readonly serverError: string | null;
  readonly onSubmit: (values: PostEditorValues) => void;
  // Optional Revisions trigger slot — route layer wires the
  // `<RevisionsSheet />` with RPC fetchers + onRestore and passes it
  // here when the entry type declares `supports: ['revisions']`.
  readonly revisionsTrigger?: ReactNode;
  // Debounce window for autosave. When > 0, value edits trigger
  // `onSubmit` after the window elapses with no new edits. 0 (default)
  // disables autosave entirely so the layout keeps its explicit-save
  // behaviour for callers that don't want it.
  readonly autosaveMs?: number;
}

const LABEL: Readonly<Record<SaveStatus, MessageDescriptor>> = {
  saved: M.statusSaved,
  saving: M.statusSaving,
  error: M.statusError,
};

function resolveStatus(
  isSubmitting: boolean,
  serverError: string | null,
): SaveStatus {
  if (isSubmitting) return "saving";
  if (serverError) return "error";
  return "saved";
}

export function PlainFormLayout({
  initialValues,
  metaBoxes,
  headline,
  isSubmitting,
  serverError,
  onSubmit,
  revisionsTrigger,
  autosaveMs = 0,
}: PlainFormLayoutProps): ReactElement {
  const renderLabel = useLabel();
  const form = useForm({
    resolver: valibotResolver(postEditorSchema),
    defaultValues: initialValues,
  });
  // useWatch keeps the Publish button's disabled state from forcing the
  // whole tree (every Card + MetaBoxField) to re-render on every keystroke.
  const status = useWatch({ control: form.control, name: "status" });
  const saveStatus = resolveStatus(isSubmitting, serverError);
  const watched = useWatch({ control: form.control });
  const isDirty = form.formState.isDirty;
  const onSubmitRef = useRef(onSubmit);
  useEffect(() => {
    onSubmitRef.current = onSubmit;
  });
  useEffect(() => {
    if (autosaveMs <= 0) return;
    if (!isDirty) return;
    // Skip while a save is already in flight — the timer's keystroke
    // dep makes it re-arm as soon as `isSubmitting` flips back to
    // false, so a single coalesced save runs per quiet window.
    if (isSubmitting) return;
    const timer = setTimeout(() => {
      void form.handleSubmit((values) => onSubmitRef.current(values))();
    }, autosaveMs);
    return () => clearTimeout(timer);
  }, [watched, autosaveMs, isDirty, isSubmitting, form]);
  return (
    <Form {...form}>
      <form
        className="mx-auto flex max-w-2xl flex-col gap-4 p-6"
        data-testid="plain-form-layout"
        onSubmit={(event) => {
          void form.handleSubmit(onSubmit)(event);
        }}
      >
        <h1 className="sr-only">{headline}</h1>
        <header
          className="flex items-center gap-3 border-b pb-3"
          data-testid="plain-form-header"
        >
          <FormField
            control={form.control}
            name="title"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormControl>
                  <Input
                    {...field}
                    type="text"
                    placeholder={renderLabel(M.titlePlaceholder)}
                    aria-label="Entry title"
                    data-testid="plain-form-title-input"
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <span
            className="bg-muted rounded px-2 py-1 text-xs"
            data-testid="plain-form-status-pill"
            data-status={saveStatus}
          >
            {renderLabel(LABEL[saveStatus])}
          </span>
          {revisionsTrigger}
          <Button
            type="submit"
            variant="outline"
            data-testid="plain-form-save-button"
            disabled={isSubmitting}
          >
            <Trans id="editor.plainForm.save" message="Save" />
          </Button>
          <Button
            type="button"
            data-testid="plain-form-publish-button"
            disabled={isSubmitting || status === "published"}
            onClick={() => {
              form.setValue("status", "published");
              void form.handleSubmit(onSubmit)();
            }}
          >
            <Trans id="editor.plainForm.publish" message="Publish" />
          </Button>
        </header>
        {metaBoxes.map((box) => (
          <section
            key={box.id}
            aria-labelledby={`plain-form-meta-box-heading-${box.id}`}
            data-testid={`plain-form-meta-box-${box.id}`}
          >
            <Card className="@container">
              <CardHeader>
                <h2
                  id={`plain-form-meta-box-heading-${box.id}`}
                  className="text-lg leading-none font-semibold"
                  data-testid={`plain-form-meta-box-heading-${box.id}`}
                >
                  {renderLabel(box.label)}
                </h2>
                {box.description ? (
                  <CardDescription>
                    {renderLabel(box.description)}
                  </CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {box.fields.map((field) => (
                  <MetaBoxField
                    key={field.key}
                    field={field}
                    name={`meta.${field.key}`}
                    disabled={isSubmitting}
                  />
                ))}
              </CardContent>
            </Card>
          </section>
        ))}
      </form>
    </Form>
  );
}
