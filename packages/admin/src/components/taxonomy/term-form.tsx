import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { MetaBoxCard } from "@/components/meta-box/meta-box.js";
import { useLabel } from "@/lib/use-label.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { Label } from "@plumix/core/i18n";
import type { TermMetaBoxManifestEntry } from "@plumix/core/manifest";
import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import { Button } from "@plumix/admin-ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@plumix/admin-ui/form";
import { Input } from "@plumix/admin-ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@plumix/admin-ui/select";
import { Textarea } from "@plumix/admin-ui/textarea";
import { idParam, vMessage } from "@plumix/core/validation";

/** Normalised input shape consumed by both create + update paths. */
interface TermFormValues {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly parentId: number | null;
  /** Plugin-registered meta bag. Shape is open because meta-box fields
   *  coerce per-field on edit; the server re-sanitises on write. */
  readonly meta: Readonly<Record<string, unknown>>;
}

const M = {
  slugFormat: defineMessage({
    id: "termForm.slug.format",
    message: "Slug may only contain lowercase letters, digits, and hyphens.",
  }),
  rootOption: defineMessage({
    id: "termForm.parent.rootOption",
    message: "— root —",
  }),
} satisfies Record<string, MessageDescriptor>;

// Radix Select forbids an empty-string item value, so the "root" choice
// carries a sentinel that maps back to `null` (no parent) on change.
const ROOT_VALUE = "__root__";

// Client-side shape mirrors `termCreateInputSchema` / `termUpdateInputSchema`
// on the server. Slug is optional at the form level — the server derives
// it from the name if omitted (see `term.create` handler).
const termFormSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(200),
    v.regex(/^[a-z0-9-]*$/, vMessage(M.slugFormat)),
  ),
  description: v.pipe(v.string(), v.trim(), v.maxLength(2000)),
  parentId: v.nullable(idParam),
  meta: v.record(v.string(), v.unknown()),
});

/**
 * Form component shared by `/terms/$name/new` and
 * `/terms/$name/$id` — the only differences between create and
 * edit are the mutation target + the default values, both injected by
 * the parent route. The `submitLabel` prop lets callers say "Create" vs
 * "Save changes" without the form knowing which mode it's in.
 *
 * `parentOptions` is a pre-flattened list with depth-indented labels
 * (see `parentPickerOptions` in `./tree.ts`) so the select visibly
 * conveys nesting. Editing a term? Pass a list that excludes the term
 * itself and its descendants — client-side cycle prevention that's
 * kinder than a round-trip to a CONFLICT.
 */
interface ParentOption {
  readonly id: number;
  readonly label: string;
}

export function TermForm({
  initialValues,
  isHierarchical,
  parentOptions,
  isSubmitting,
  serverError,
  submitLabel,
  metaBoxes,
  onSubmit,
  onCancel,
}: {
  readonly initialValues: TermFormValues;
  readonly isHierarchical: boolean;
  readonly parentOptions: readonly ParentOption[];
  readonly isSubmitting: boolean;
  /** Server-side error. Pass a localized descriptor (`Label`) or a raw
   *  `err.message` string; resolved through `useLabel()` at render. */
  readonly serverError: Label | null;
  /** Submit-button copy when not pending. Caller picks "Create" vs
   *  "Save changes" and passes a localized `Label`. */
  readonly submitLabel: Label;
  /** Plugin-registered meta boxes for this taxonomy — rendered inside
   *  the form so the single Save button submits row fields + meta
   *  together via one `term.update` call. Pass an empty array when no
   *  boxes are registered for the current viewer. */
  readonly metaBoxes: readonly TermMetaBoxManifestEntry[];
  readonly onSubmit: (values: TermFormValues) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const labelFn = useLabel();
  const form = useForm({
    resolver: valibotResolver(termFormSchema),
    defaultValues: initialValues,
  });

  const handleSubmit = form.handleSubmit((value) => {
    onSubmit(value);
  });

  return (
    <Form {...form}>
      <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans id="termForm.name" message="Name" />
              </FormLabel>
              <FormControl>
                <Input
                  type="text"
                  required
                  disabled={isSubmitting}
                  data-testid="term-form-name-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="slug"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans id="termForm.slug" message="Slug" />
              </FormLabel>
              <FormControl>
                <Input
                  type="text"
                  autoComplete="off"
                  disabled={isSubmitting}
                  data-testid="term-form-slug-input"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                <Trans id="termForm.description" message="Description" />
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  disabled={isSubmitting}
                  rows={3}
                  data-testid="term-form-description-input"
                  className="min-h-20"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {isHierarchical ? (
          <FormField
            control={form.control}
            name="parentId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  <Trans id="termForm.parent" message="Parent" />
                </FormLabel>
                <FormControl>
                  <Select
                    value={
                      field.value == null ? ROOT_VALUE : String(field.value)
                    }
                    onValueChange={(next) => {
                      field.onChange(next === ROOT_VALUE ? null : Number(next));
                    }}
                    disabled={isSubmitting}
                  >
                    <SelectTrigger
                      className="w-full"
                      onBlur={field.onBlur}
                      data-testid="term-form-parent-select"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ROOT_VALUE}>
                        {labelFn(M.rootOption)}
                      </SelectItem>
                      {parentOptions.map((opt) => (
                        <SelectItem key={opt.id} value={String(opt.id)}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {metaBoxes.map((box) => (
          <MetaBoxCard
            key={box.id}
            box={box}
            basePath="meta"
            disabled={isSubmitting}
          />
        ))}

        {serverError ? (
          <Alert variant="destructive" data-testid="term-form-server-error">
            <AlertDescription>{labelFn(serverError)}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            <Trans id="termForm.cancel" message="Cancel" />
          </Button>
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="term-form-submit"
          >
            {isSubmitting ? (
              <Trans id="termForm.submitting" message="Saving…" />
            ) : (
              labelFn(submitLabel)
            )}
          </Button>
        </div>
      </form>
    </Form>
  );
}
