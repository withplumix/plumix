import type { JSONContent } from "@tiptap/react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
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
import { useBlocker } from "@tanstack/react-router";
import { useForm, useWatch } from "react-hook-form";
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
   * into `bottom` (default, below the main editor) and `sidebar`
   * (right rail) regions based on `box.location`.
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
    resolver: valibotResolver(postEditorSchema),
    defaultValues: initialValues,
  });

  const titleValue = useWatch({ control: form.control, name: "title" });
  const metaValues = useWatch({ control: form.control, name: "meta" });
  const isDirty = form.formState.isDirty;

  // Drive the slug from the title while the slug remains unlocked —
  // same debounce-free UX WordPress uses for new-post auto-slug.
  useEffect(() => {
    if (slugLocked) return;
    form.setValue("slug", slugify(titleValue), { shouldDirty: true });
  }, [form, slugLocked, titleValue]);

  // TanStack Router blocker: prompt before navigation (sidebar click,
  // back button, etc.) if the form is dirty and not currently saving.
  // `isSubmitting` guard avoids the prompt firing on the redirect that
  // follows a successful save.
  useBlocker({
    shouldBlockFn: () => !isSubmitting && isDirty,
    withResolver: false,
    disabled: isSubmitting,
  });

  const { bottom, sidebar } = partitionBoxesByLocation(metaBoxes);

  const onMetaChange = (key: string, next: unknown): void => {
    form.setValue(
      "meta",
      { ...metaValues, [key]: next },
      { shouldDirty: true },
    );
  };

  const handleSubmit = form.handleSubmit((value) => {
    onSubmit(value);
  });

  return (
    <Form {...form}>
      <form
        className="flex flex-col gap-6"
        data-testid="post-editor-form"
        onSubmit={handleSubmit}
      >
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="flex flex-col gap-6">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Title</FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      required
                      autoComplete="off"
                      disabled={isSubmitting}
                      data-testid="post-editor-title-input"
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
                      required
                      autoComplete="off"
                      disabled={isSubmitting}
                      data-testid="post-editor-slug-input"
                      {...field}
                      onChange={(e) => {
                        // Any direct edit to the slug input locks out the
                        // title-driven auto-derivation for the rest of this
                        // editor session.
                        setSlugLocked(true);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="content"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Content</FormLabel>
                  <FormControl>
                    <div>
                      <TiptapEditor
                        value={field.value}
                        onChange={(json) => {
                          field.onChange(json);
                        }}
                        disabled={isSubmitting}
                        ariaLabel="Entry content"
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="excerpt"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Excerpt{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <textarea
                      {...field}
                      maxLength={600}
                      rows={3}
                      disabled={isSubmitting}
                      className="border-input bg-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Status</FormLabel>
                  <FormControl>
                    <select
                      value={field.value}
                      onBlur={field.onBlur}
                      onChange={(e) => {
                        field.onChange(e.target.value);
                      }}
                      disabled={isSubmitting}
                      className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {availableStatuses.map((status) => (
                        <option
                          key={status}
                          value={status}
                          className="capitalize"
                        >
                          {capitalize(status)}
                        </option>
                      ))}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <MetaBoxRegion
              boxes={bottom}
              testId="meta-boxes-bottom"
              values={metaValues}
              onChange={onMetaChange}
              disabled={isSubmitting}
            />
          </div>

          <aside
            className="flex flex-col gap-4"
            data-testid="meta-boxes-sidebar"
          >
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
          <Button
            type="submit"
            disabled={isSubmitting}
            data-testid="post-editor-submit"
          >
            {isSubmitting ? "Saving…" : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
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
