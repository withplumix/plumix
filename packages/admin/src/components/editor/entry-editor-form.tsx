import type { JSONContent } from "@tiptap/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { MetaBoxCard } from "@/components/meta-box/meta-box.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Label } from "@/components/ui/label.js";
import { useForm, useStore } from "@tanstack/react-form";
import { useBlocker } from "@tanstack/react-router";
import * as v from "valibot";

import type { EntryMetaBoxManifestEntry } from "@plumix/core/manifest";
import type { EntryStatus } from "@plumix/core/schema";
import { slugify } from "@plumix/core/slugify";

import { TiptapEditor } from "./tiptap-editor.js";

// Matches the server's `slugSchema` — lowercase ASCII alphanumerics
// separated by single dashes. Keeping a local copy so the admin form
// surfaces the same error inline without a round-trip.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const postEditorSchema = v.object({
  title: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(300)),
  slug: v.pipe(
    v.string(),
    v.trim(),
    v.minLength(1),
    v.maxLength(200),
    v.regex(
      SLUG_PATTERN,
      "Slug must be lowercase letters, numbers, and dashes",
    ),
  ),
  content: v.nullable(v.custom<JSONContent>(() => true)),
  excerpt: v.optional(v.pipe(v.string(), v.maxLength(600)), ""),
  status: v.picklist(["draft", "published", "scheduled", "trash"] as const),
  /**
   * Meta-box values — one entry per `MetaBoxFieldManifestEntry.key` the
   * editor renders. The form carries them as opaque `unknown` values and
   * leaves per-field type-shaping to the dispatcher. Server persistence
   * lands in a follow-up PR; today callers receive `meta` in `onSubmit`
   * and can ignore it.
   */
  meta: v.record(v.string(), v.unknown()),
});

export type PostEditorValues = v.InferOutput<typeof postEditorSchema>;

// All statuses the dropdown should expose. `trash` is excluded from the
// new-post flow (you don't create a post into the trash bin), but the
// editor of an existing post may need to see it if loaded with that
// status — caller filters the list via `availableStatuses`.
export const POST_EDITOR_STATUSES: readonly EntryStatus[] = [
  "draft",
  "published",
  "scheduled",
  "trash",
];

interface PostEditorFormProps {
  readonly initialValues: PostEditorValues;
  /** Slug starts unlocked until user edits the slug field directly. For
   * existing entries pass `true` so title edits don't silently rename the
   * URL. */
  readonly slugLocked: boolean;
  readonly availableStatuses: readonly EntryStatus[];
  /**
   * Meta boxes applicable to the post type being edited, already
   * filtered by capability and sorted by priority. The form splits them
   * into side / normal / advanced columns internally based on
   * `entry.context`.
   */
  readonly metaBoxes: readonly EntryMetaBoxManifestEntry[];
  readonly submitLabel: string;
  readonly isSubmitting: boolean;
  readonly serverError?: string | null;
  readonly onSubmit: (values: PostEditorValues) => void;
  readonly onCancel: () => void;
}

export function PostEditorForm({
  initialValues,
  slugLocked: initialSlugLocked,
  availableStatuses,
  metaBoxes,
  submitLabel,
  isSubmitting,
  serverError,
  onSubmit,
  onCancel,
}: PostEditorFormProps): ReactNode {
  // Once the user edits the slug field manually we stop regenerating it
  // from the title. Standard WP auto-slug behavior.
  const [slugLocked, setSlugLocked] = useState(initialSlugLocked);

  const form = useForm({
    defaultValues: initialValues,
    validators: {
      onSubmit: ({ value }) => {
        const result = v.safeParse(postEditorSchema, value);
        return result.success ? undefined : result.issues[0].message;
      },
    },
    onSubmit: ({ value }) => {
      onSubmit(value);
    },
  });

  // Subscribe to title changes so we can push an auto-derived slug while
  // the slug is still unlocked. `useStore` is TanStack Form's reactive
  // selector — firing as the user types is exactly the debounce-free UX
  // WP uses for new-post auto-slug.
  const titleValue = useStore(form.store, (state) => state.values.title);
  useEffect(() => {
    if (slugLocked) return;
    form.setFieldValue("slug", slugify(titleValue));
  }, [form, slugLocked, titleValue]);

  const isDirty = useStore(form.store, (state) => state.isDirty);

  // TanStack Router blocker: prompt before navigation (sidebar click,
  // back button, etc.) if the form is dirty and not currently saving.
  // `isSubmitting` guard avoids the prompt firing on the redirect that
  // follows a successful save.
  useBlocker({
    shouldBlockFn: () => !isSubmitting && isDirty,
    withResolver: false,
    disabled: isSubmitting,
  });

  // Two-slot layout: `sidebar` floats right of the main editor column,
  // `bottom` (default) stacks below the primary fields.
  const { bottom, sidebar } = partitionBoxesByLocation(metaBoxes);

  // Single subscription to the form's `meta` field powers all three
  // regions — each box reads from `metaValues` and writes via the shared
  // `onMetaChange`. Sharing the subscription avoids triple-re-renders on
  // every keystroke.
  const metaValues = useStore(form.store, (state) => state.values.meta);
  const onMetaChange = (key: string, next: unknown): void => {
    form.setFieldValue("meta", { ...metaValues, [key]: next });
  };

  return (
    <form
      className="flex flex-col gap-6"
      data-testid="post-editor-form"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <form.Field name="title">
            {(field) => (
              <TextFieldRow
                field={field}
                label="Title"
                required
                disabled={isSubmitting}
                testId="post-editor-title-input"
              />
            )}
          </form.Field>

          <form.Field name="slug">
            {(field) => (
              <TextFieldRow
                field={field}
                label="Slug"
                required
                disabled={isSubmitting}
                testId="post-editor-slug-input"
                onChangeValue={(next) => {
                  // Any direct edit to the slug input locks out the
                  // title-driven auto-derivation for the rest of this
                  // editor session.
                  setSlugLocked(true);
                  field.handleChange(next);
                }}
              />
            )}
          </form.Field>

          <form.Field name="content">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="post-editor-content">Content</Label>
                <div id="post-editor-content">
                  <TiptapEditor
                    value={field.state.value}
                    onChange={(json) => {
                      field.handleChange(json);
                    }}
                    disabled={isSubmitting}
                    ariaLabel="Entry content"
                  />
                </div>
              </div>
            )}
          </form.Field>

          <form.Field name="excerpt">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="post-editor-excerpt">
                  Excerpt{" "}
                  <span className="text-muted-foreground">(optional)</span>
                </Label>
                <textarea
                  id="post-editor-excerpt"
                  name="excerpt"
                  value={field.state.value}
                  maxLength={600}
                  rows={3}
                  disabled={isSubmitting}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value);
                  }}
                  className="border-input bg-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                />
              </div>
            )}
          </form.Field>

          <form.Field name="status">
            {(field) => (
              <div className="flex flex-col gap-2">
                <Label htmlFor="post-editor-status">Status</Label>
                <select
                  id="post-editor-status"
                  name="status"
                  value={field.state.value}
                  disabled={isSubmitting}
                  onBlur={field.handleBlur}
                  onChange={(e) => {
                    field.handleChange(e.target.value as EntryStatus);
                  }}
                  className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {availableStatuses.map((status) => (
                    <option key={status} value={status} className="capitalize">
                      {capitalize(status)}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </form.Field>

          <MetaBoxRegion
            boxes={bottom}
            testId="meta-boxes-bottom"
            values={metaValues}
            onChange={onMetaChange}
            disabled={isSubmitting}
          />
        </div>

        <aside className="flex flex-col gap-4" data-testid="meta-boxes-sidebar">
          <MetaBoxRegion
            boxes={sidebar}
            testId="meta-boxes-sidebar-boxes"
            values={metaValues}
            onChange={onMetaChange}
            disabled={isSubmitting}
          />
        </aside>
      </div>

      {serverError ? (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      ) : null}

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onCancel}
          disabled={isSubmitting}
          data-testid="post-editor-cancel"
        >
          Cancel
        </Button>
        <form.Subscribe selector={(state) => state.canSubmit}>
          {(canSubmit) => (
            <Button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              data-testid="post-editor-submit"
            >
              {isSubmitting ? "Saving…" : submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </div>
    </form>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

// Two-slot layout. Unspecified / unknown `location` falls back to
// "bottom" so plugin-specific values don't vanish into nowhere.
function partitionBoxesByLocation(
  boxes: readonly EntryMetaBoxManifestEntry[],
): {
  bottom: readonly EntryMetaBoxManifestEntry[];
  sidebar: readonly EntryMetaBoxManifestEntry[];
} {
  const bottom: EntryMetaBoxManifestEntry[] = [];
  const sidebar: EntryMetaBoxManifestEntry[] = [];
  for (const box of boxes) {
    if (box.location === "sidebar") sidebar.push(box);
    else bottom.push(box);
  }
  return { bottom, sidebar };
}

// Render a stack of boxes against a shared meta bag. Nothing renders
// when the bucket is empty so the layout stays tight.
function MetaBoxRegion({
  boxes,
  testId,
  values,
  onChange,
  disabled,
}: {
  readonly boxes: readonly EntryMetaBoxManifestEntry[];
  readonly testId: string;
  readonly values: Readonly<Record<string, unknown>>;
  readonly onChange: (key: string, next: unknown) => void;
  readonly disabled: boolean;
}): ReactNode {
  if (boxes.length === 0) return null;
  return (
    <div className="flex flex-col gap-4" data-testid={testId}>
      {boxes.map((box) => (
        <MetaBoxCard
          key={box.id}
          box={box}
          values={values}
          disabled={disabled}
          onChange={onChange}
        />
      ))}
    </div>
  );
}

// Lightweight field row for the editor's text inputs. FormField (used on
// auth forms) wires `onChange` internally and doesn't expose a hook — the
// editor needs to intercept slug edits to lock auto-derivation, so we use
// a local binding here. Keeps the ARIA wiring equivalent.
interface TextFieldRowProps {
  readonly field: {
    readonly name: string;
    readonly state: {
      readonly value: string;
      readonly meta: { readonly errors: readonly unknown[] };
    };
    readonly handleBlur: () => void;
    readonly handleChange: (value: string) => void;
  };
  readonly label: string;
  readonly required?: boolean;
  readonly disabled?: boolean;
  readonly onChangeValue?: (value: string) => void;
  /** Stable hook for e2e/unit tests; prefer these over role/label queries. */
  readonly testId?: string;
}

function TextFieldRow({
  field,
  label,
  required,
  disabled,
  onChangeValue,
  testId,
}: TextFieldRowProps): ReactNode {
  const errors = field.state.meta.errors;
  const hasError = errors.length > 0;
  const errorId = `${field.name}-error`;
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.name}>{label}</Label>
      <Input
        id={field.name}
        name={field.name}
        type="text"
        value={field.state.value}
        required={required}
        disabled={disabled}
        autoComplete="off"
        aria-invalid={hasError || undefined}
        aria-describedby={hasError ? errorId : undefined}
        data-testid={testId}
        onBlur={field.handleBlur}
        onChange={(e) => {
          const next = e.target.value;
          if (onChangeValue) onChangeValue(next);
          else field.handleChange(next);
        }}
      />
      {hasError ? (
        <p id={errorId} className="text-destructive text-sm">
          {String(errors[0])}
        </p>
      ) : null}
    </div>
  );
}
