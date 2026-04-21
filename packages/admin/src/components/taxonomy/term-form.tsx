import type { ReactNode } from "react";
import { FormField } from "@/components/form/field.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Label } from "@/components/ui/label.js";
import { useForm } from "@tanstack/react-form";
import * as v from "valibot";

import { idParam } from "@plumix/core/validation";

/** Normalised input shape consumed by both create + update paths. */
interface TermFormValues {
  readonly name: string;
  readonly slug: string;
  readonly description: string;
  readonly parentId: number | null;
}

// Client-side shape mirrors `termCreateInputSchema` / `termUpdateInputSchema`
// on the server. Slug is optional at the form level — the server derives
// it from the name if omitted (see `term.create` handler).
const termFormSchema = v.object({
  name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200)),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.maxLength(200),
    v.regex(
      /^[a-z0-9-]*$/,
      "Slug may only contain lowercase letters, digits, and hyphens.",
    ),
  ),
  description: v.pipe(v.string(), v.trim(), v.maxLength(2000)),
  parentId: v.nullable(idParam),
});

/**
 * Form component shared by `/taxonomies/$name/new` and
 * `/taxonomies/$name/$id` — the only differences between create and
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
  onSubmit,
  onCancel,
}: {
  readonly initialValues: TermFormValues;
  readonly isHierarchical: boolean;
  readonly parentOptions: readonly ParentOption[];
  readonly isSubmitting: boolean;
  readonly serverError: string | null;
  readonly submitLabel: string;
  readonly onSubmit: (values: TermFormValues) => void;
  readonly onCancel: () => void;
}): ReactNode {
  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(termFormSchema, value);
        return result.success ? undefined : result.issues[0].message;
      },
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.Field name="name">
        {(field) => (
          <FormField
            field={field}
            label="Name"
            type="text"
            required
            disabled={isSubmitting}
            data-testid="term-form-name-input"
          />
        )}
      </form.Field>

      <form.Field name="slug">
        {(field) => (
          <FormField
            field={field}
            label={
              <>
                Slug <span className="text-muted-foreground">(optional)</span>
              </>
            }
            type="text"
            autoComplete="off"
            disabled={isSubmitting}
            data-testid="term-form-slug-input"
            placeholder="derived-from-name-if-blank"
          />
        )}
      </form.Field>

      <form.Field name="description">
        {(field) => (
          <div className="flex flex-col gap-2">
            <Label htmlFor="term-description">
              Description{" "}
              <span className="text-muted-foreground">(optional)</span>
            </Label>
            <textarea
              id="term-description"
              name="description"
              value={field.state.value}
              onChange={(e) => {
                field.handleChange(e.target.value);
              }}
              disabled={isSubmitting}
              rows={3}
              data-testid="term-form-description-input"
              className="border-input bg-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>
        )}
      </form.Field>

      {isHierarchical ? (
        <form.Field name="parentId">
          {(field) => (
            <div className="flex flex-col gap-2">
              <Label htmlFor="term-parent">
                Parent <span className="text-muted-foreground">(optional)</span>
              </Label>
              <select
                id="term-parent"
                name="parentId"
                value={
                  field.state.value == null ? "" : String(field.state.value)
                }
                onChange={(e) => {
                  const raw = e.target.value;
                  field.handleChange(raw === "" ? null : Number(raw));
                }}
                disabled={isSubmitting}
                data-testid="term-form-parent-select"
                className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="">— root —</option>
                {parentOptions.map((opt) => (
                  <option key={opt.id} value={String(opt.id)}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </form.Field>
      ) : null}

      {serverError ? (
        <Alert variant="destructive" data-testid="term-form-server-error">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              data-testid="term-form-submit"
            >
              {isSubmitting ? "Saving…" : submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}
