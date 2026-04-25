import type { ReactNode } from "react";
import { MetaBoxCard } from "@/components/meta-box/meta-box.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form.js";
import { Input } from "@/components/ui/input.js";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useForm } from "react-hook-form";
import * as v from "valibot";

import type { TermMetaBoxManifestEntry } from "@plumix/core/manifest";
import { idParam } from "@plumix/core/validation";

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
  readonly serverError: string | null;
  readonly submitLabel: string;
  /** Plugin-registered meta boxes for this taxonomy — rendered inside
   *  the form so the single Save button submits row fields + meta
   *  together via one `term.update` call. Pass an empty array when no
   *  boxes are registered for the current viewer. */
  readonly metaBoxes: readonly TermMetaBoxManifestEntry[];
  readonly onSubmit: (values: TermFormValues) => void;
  readonly onCancel: () => void;
}): ReactNode {
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
              <FormLabel>Name</FormLabel>
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
              <FormLabel>Slug</FormLabel>
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
              <FormLabel>Description</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  disabled={isSubmitting}
                  rows={3}
                  data-testid="term-form-description-input"
                  className="border-input bg-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
                <FormLabel>Parent</FormLabel>
                <FormControl>
                  <select
                    value={field.value == null ? "" : String(field.value)}
                    onBlur={field.onBlur}
                    onChange={(e) => {
                      const raw = e.target.value;
                      field.onChange(raw === "" ? null : Number(raw));
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
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="term-form-submit"
          >
            {isSubmitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
