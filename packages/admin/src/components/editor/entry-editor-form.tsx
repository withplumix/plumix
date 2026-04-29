import type { JSONContent } from "@tiptap/react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { MultiSelect } from "@/components/form/multi-select.js";
import { MetaBoxAccordionItem } from "@/components/meta-box/meta-box.js";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
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
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar.js";
import { orpc } from "@/lib/orpc.js";
import { buildEditorTermOptions } from "@/lib/terms.js";
import { cn } from "@/lib/utils";
import { valibotResolver } from "@hookform/resolvers/valibot";
import { useQuery } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { useForm, useFormContext, useWatch } from "react-hook-form";
import * as v from "valibot";

import type {
  EntryMetaBoxManifestEntry,
  TermTaxonomyManifestEntry,
} from "@plumix/core/manifest";
import type { EntryStatus, Term } from "@plumix/core/schema";
import { slugify } from "@plumix/core/slugify";
import { idParam } from "@plumix/core/validation";

import type { ParentPickerOption } from "./entry-tree.js";
import { TiptapEditor } from "./tiptap-editor.js";

// Stable empty fallbacks — react-query returns a fresh `[]` for
// `data` while loading, which would invalidate `useMemo` deps every
// render if we used `?? []` inline.
const EMPTY_TERMS: readonly Term[] = [];
const EMPTY_NUMBER_IDS: readonly number[] = [];

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
  /**
   * Term assignments per taxonomy: `{ category: [3, 7], tag: [12] }`.
   * Caller filters this against the entry-type's registered
   * taxonomies on submit; arbitrary keys are tolerated here so a
   * plugin-added taxonomy doesn't require a schema update.
   */
  terms: v.record(v.string(), v.array(v.number())),
  /** `null` means root. Hidden for non-hierarchical types — the field
   *  stays at `null` and the route's mutation skips it. */
  parentId: v.nullable(idParam),
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

/**
 * Default feature set when `entryType.supports` is omitted — matches
 * what the admin surface needs to render a usable entry editor.
 * WordPress parity: `title` + `editor`. We add `slug` because it's
 * load-bearing for routing; a plugin that genuinely wants slug off can
 * opt out explicitly.
 */
const DEFAULT_ENTRY_SUPPORTS: readonly string[] = ["title", "editor", "slug"];

interface PostEditorFormProps {
  readonly initialValues: PostEditorValues;
  /** Slug starts unlocked until user edits the slug field directly. For
   * existing entries pass `true` so title edits don't silently rename the
   * URL. */
  readonly slugLocked: boolean;
  readonly availableStatuses: readonly EntryStatus[];
  /** Pass `entryType.supports` straight through. Omit (or `undefined`)
   *  falls back to `["title", "editor", "slug"]` — WP parity plus slug. */
  readonly supports?: readonly string[];
  /**
   * Meta boxes applicable to the post type being edited, already
   * filtered by capability and sorted by priority. All boxes land in
   * the right rail stacked below the built-in Permalink / Status /
   * Excerpt cards — `box.location` is ignored.
   */
  readonly metaBoxes: readonly EntryMetaBoxManifestEntry[];
  /** Taxonomies registered for this entry type. One Accordion section
   *  is rendered per taxonomy, with a Combobox-based multi-select
   *  populated from `term.list`. */
  readonly taxonomies: readonly TermTaxonomyManifestEntry[];
  /** When true, render the Parent rail section. Pages are hierarchical;
   *  posts are not. */
  readonly isHierarchical: boolean;
  /** Depth-indented options. Edit route excludes self+descendants for
   *  cycle prevention. Ignored when `isHierarchical` is false. */
  readonly parentOptions: readonly ParentPickerOption[];
  /** Caption shown next to the back button — e.g. `"New post"` or
   *  `"Edit post"`. The editor itself is the page, so there's no
   *  separate `<h1>` above it. */
  readonly headline: string;
  readonly submitLabel: string;
  readonly isSubmitting: boolean;
  readonly serverError?: string | null;
  readonly onSubmit: (values: PostEditorValues) => void;
  readonly onCancel: () => void;
}

interface SupportFlags {
  readonly showTitle: boolean;
  readonly showEditor: boolean;
  readonly showSlug: boolean;
  readonly showExcerpt: boolean;
}

function resolveSupportFlags(
  supports: readonly string[] | undefined,
): SupportFlags {
  const resolved = supports ?? DEFAULT_ENTRY_SUPPORTS;
  return {
    showTitle: resolved.includes("title"),
    showEditor: resolved.includes("editor"),
    showSlug: resolved.includes("slug"),
    showExcerpt: resolved.includes("excerpt"),
  };
}

// Open every rail section by default — Gutenberg parity. Users
// collapse what they don't use; the multi-select accordion keeps
// the toggled state independent per section for the rest of the
// editor session.
function buildOpenSections({
  showSlug,
  isHierarchical,
  showExcerpt,
  taxonomies,
  metaBoxes,
}: {
  showSlug: boolean;
  isHierarchical: boolean;
  showExcerpt: boolean;
  taxonomies: readonly { name: string }[];
  metaBoxes: readonly { id: string }[];
}): string[] {
  return [
    ...(showSlug ? ["permalink"] : []),
    "status",
    ...(isHierarchical ? ["parent"] : []),
    ...(showExcerpt ? ["excerpt"] : []),
    ...taxonomies.map((tax) => `taxonomy:${tax.name}`),
    ...metaBoxes.map((box) => box.id),
  ];
}

export function PostEditorForm({
  initialValues,
  slugLocked: initialSlugLocked,
  availableStatuses,
  supports,
  metaBoxes,
  taxonomies,
  isHierarchical,
  parentOptions,
  headline,
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
  const isDirty = form.formState.isDirty;

  // Drive the slug from the title while the slug remains unlocked —
  // same debounce-free UX WordPress uses for new-post auto-slug.
  // No `shouldDirty` flag: rhf's default dirty tracking compares the
  // current value to the default, so a mount-time sync where both are
  // "" stays clean and the router blocker won't fire pre-emptively.
  useEffect(() => {
    if (slugLocked) return;
    form.setValue("slug", slugify(titleValue));
  }, [form, slugLocked, titleValue]);

  // Block in-app navigation while dirty so the user gets a chance to
  // confirm. `withResolver: true` is load-bearing: with `false`, a
  // dirty form would silently swallow back-button / link clicks.
  // `isSubmitting` guard avoids prompting on the post-save redirect.
  const blocker = useBlocker({
    shouldBlockFn: () => !isSubmitting && isDirty,
    withResolver: true,
    disabled: isSubmitting,
  });

  const handleSubmit = form.handleSubmit((value) => {
    onSubmit(value);
  });

  const { showTitle, showEditor, showSlug, showExcerpt } =
    resolveSupportFlags(supports);

  const openSections = buildOpenSections({
    showSlug,
    isHierarchical,
    showExcerpt,
    taxonomies,
    metaBoxes,
  });

  return (
    <Form {...form}>
      {/* `contents` makes the form invisible in the flex flow so
          SidebarProvider owns the layout; fields in the rail still
          submit via Controller (rhf state, not DOM form semantics). */}
      <form
        id="entry-editor-form"
        data-testid="post-editor-form"
        onSubmit={handleSubmit}
        className="contents"
      >
        <SidebarProvider defaultOpen className="flex-1">
          <SidebarInset className="flex min-w-0 flex-col">
            <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between gap-3 border-b px-4">
              <div className="flex min-w-0 items-center gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={onCancel}
                  disabled={isSubmitting}
                  data-testid="post-editor-cancel"
                  aria-label="Back"
                >
                  <ArrowLeft />
                </Button>
                <span
                  className="truncate text-sm font-medium"
                  data-testid="post-editor-headline"
                >
                  {headline}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  data-testid="post-editor-submit"
                >
                  {isSubmitting ? "Saving…" : submitLabel}
                </Button>
                {/* `type="button"` is load-bearing: shadcn's `Button`
                    doesn't default it, and an un-typed button inside
                    `<form>` inherits `submit` — clicking the toggle
                    would otherwise fire the form's onSubmit + mutate. */}
                <SidebarTrigger type="button" />
              </div>
            </header>

            {serverError ? (
              <div className="border-b px-4 py-2">
                <Alert variant="destructive">
                  <AlertDescription>{serverError}</AlertDescription>
                </Alert>
              </div>
            ) : null}

            <main className="flex-1 overflow-auto">
              <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-10">
                {showTitle ? <TitleField disabled={isSubmitting} /> : null}
                {showEditor ? <ContentField disabled={isSubmitting} /> : null}
                {!showTitle && !showEditor ? (
                  <p
                    className="text-muted-foreground text-sm"
                    data-testid="post-editor-empty-canvas"
                  >
                    This entry type has no title or editor. Use the panels on
                    the right to manage its content.
                  </p>
                ) : null}
              </div>
            </main>
          </SidebarInset>

          <Sidebar
            side="right"
            collapsible="offcanvas"
            data-testid="meta-boxes-sidebar"
          >
            <SidebarHeader className="flex h-14 shrink-0 flex-row items-center border-b px-4 text-sm font-semibold">
              Document
            </SidebarHeader>
            <SidebarContent>
              <Accordion
                type="multiple"
                defaultValue={openSections}
                className="divide-y"
              >
                {showSlug ? (
                  <PermalinkSection
                    disabled={isSubmitting}
                    onSlugEdit={() => {
                      setSlugLocked(true);
                    }}
                  />
                ) : null}
                <StatusSection
                  availableStatuses={availableStatuses}
                  disabled={isSubmitting}
                />
                {isHierarchical ? (
                  <ParentSection
                    parentOptions={parentOptions}
                    disabled={isSubmitting}
                  />
                ) : null}
                {showExcerpt ? (
                  <ExcerptSection disabled={isSubmitting} />
                ) : null}
                {taxonomies.map((tax) => (
                  <TaxonomySection
                    key={tax.name}
                    taxonomy={tax}
                    disabled={isSubmitting}
                  />
                ))}
                {metaBoxes.map((box) => (
                  <MetaBoxAccordionItem
                    key={box.id}
                    box={box}
                    basePath="meta"
                    disabled={isSubmitting}
                  />
                ))}
              </Accordion>
            </SidebarContent>
          </Sidebar>
        </SidebarProvider>
      </form>

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && blocker.status === "blocked") blocker.reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription>
              Leaving this page will lose any edits you haven't saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (blocker.status === "blocked") blocker.proceed();
              }}
            >
              Discard
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Form>
  );
}

// ---------- canvas fields ----------

function TitleField({ disabled }: { readonly disabled: boolean }): ReactNode {
  const { control } = useFormContext<PostEditorValues>();
  return (
    <FormField
      control={control}
      name="title"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="sr-only">Title</FormLabel>
          <FormControl>
            <Input
              type="text"
              required
              autoComplete="off"
              disabled={disabled}
              placeholder="Title"
              data-testid="post-editor-title-input"
              className={cn(
                "h-auto border-0 bg-transparent px-0 text-3xl font-semibold shadow-none dark:bg-transparent",
                "placeholder:text-muted-foreground/40",
                "focus-visible:border-0 focus-visible:ring-0",
              )}
              {...field}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function ContentField({ disabled }: { readonly disabled: boolean }): ReactNode {
  const { control } = useFormContext<PostEditorValues>();
  return (
    <FormField
      control={control}
      name="content"
      render={({ field }) => (
        <FormItem>
          <FormLabel className="sr-only">Content</FormLabel>
          {/* `<div>` is the Slot target: shadcn's FormControl clones
              its single direct child to merge `id` / `aria-*` props,
              but TiptapEditor is a component that doesn't forward DOM
              attrs onto its root. The wrapper gives Slot a plain
              element to target. */}
          <FormControl>
            <div>
              <TiptapEditor
                value={field.value}
                onChange={(json) => {
                  field.onChange(json);
                }}
                disabled={disabled}
                ariaLabel="Entry content"
              />
            </div>
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

// ---------- rail sections ----------

// Shared shell for every built-in rail section — matches the layout
// `MetaBoxAccordionItem` uses for plugin boxes so the rail reads as
// one consistent stack of collapsible panels. `value` props collide
// with `openSections` keys; keep them stable.
function RailSection({
  value,
  title,
  children,
}: {
  readonly value: string;
  readonly title: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <AccordionItem value={value}>
      <AccordionTrigger className="px-4 py-3 text-sm font-semibold">
        {title}
      </AccordionTrigger>
      <AccordionContent className="px-4 pb-4">{children}</AccordionContent>
    </AccordionItem>
  );
}

function PermalinkSection({
  disabled,
  onSlugEdit,
}: {
  readonly disabled: boolean;
  readonly onSlugEdit: () => void;
}): ReactNode {
  const { control } = useFormContext<PostEditorValues>();
  return (
    <RailSection value="permalink" title="Permalink">
      <FormField
        control={control}
        name="slug"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Slug</FormLabel>
            <FormControl>
              <Input
                type="text"
                required
                autoComplete="off"
                disabled={disabled}
                data-testid="post-editor-slug-input"
                {...field}
                onChange={(e) => {
                  // Any direct edit to the slug input locks out the
                  // title-driven auto-derivation for the rest of this
                  // editor session.
                  onSlugEdit();
                  field.onChange(e);
                }}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </RailSection>
  );
}

function StatusSection({
  availableStatuses,
  disabled,
}: {
  readonly availableStatuses: readonly EntryStatus[];
  readonly disabled: boolean;
}): ReactNode {
  const { control } = useFormContext<PostEditorValues>();
  return (
    <RailSection value="status" title="Status">
      <FormField
        control={control}
        name="status"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Status</FormLabel>
            <FormControl>
              <select
                value={field.value}
                onBlur={field.onBlur}
                onChange={(e) => {
                  field.onChange(e.target.value);
                }}
                disabled={disabled}
                data-testid="post-editor-status-select"
                className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {availableStatuses.map((status) => (
                  <option key={status} value={status} className="capitalize">
                    {capitalize(status)}
                  </option>
                ))}
              </select>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </RailSection>
  );
}

function ParentSection({
  parentOptions,
  disabled,
}: {
  readonly parentOptions: readonly ParentPickerOption[];
  readonly disabled: boolean;
}): ReactNode {
  const { control } = useFormContext<PostEditorValues>();
  return (
    <RailSection value="parent" title="Parent">
      <FormField
        control={control}
        name="parentId"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Parent</FormLabel>
            <FormControl>
              <select
                value={field.value == null ? "" : String(field.value)}
                onBlur={field.onBlur}
                onChange={(e) => {
                  const raw = e.target.value;
                  field.onChange(raw === "" ? null : Number(raw));
                }}
                disabled={disabled}
                data-testid="post-editor-parent-select"
                className="border-input bg-background focus-visible:ring-ring h-9 w-full rounded-md border px-3 py-1 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
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
    </RailSection>
  );
}

function ExcerptSection({
  disabled,
}: {
  readonly disabled: boolean;
}): ReactNode {
  const { control } = useFormContext<PostEditorValues>();
  return (
    <RailSection value="excerpt" title="Excerpt">
      <FormField
        control={control}
        name="excerpt"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="sr-only">Excerpt</FormLabel>
            <FormControl>
              <textarea
                {...field}
                maxLength={600}
                rows={3}
                disabled={disabled}
                data-testid="post-editor-excerpt-input"
                className="border-input bg-background focus-visible:ring-ring flex min-h-20 w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </RailSection>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function TaxonomySection({
  taxonomy,
  disabled,
}: {
  readonly taxonomy: TermTaxonomyManifestEntry;
  readonly disabled: boolean;
}): ReactNode {
  const { control } = useFormContext<PostEditorValues>();
  const termsQuery = useQuery(
    orpc.term.list.queryOptions({
      input: { taxonomy: taxonomy.name, limit: 200 },
    }),
  );
  const isHierarchical = taxonomy.isHierarchical === true;
  const options = useMemo(
    () =>
      buildEditorTermOptions(termsQuery.data ?? EMPTY_TERMS, isHierarchical),
    [termsQuery.data, isHierarchical],
  );

  const pluralLower = taxonomy.label.toLowerCase();
  return (
    <RailSection value={`taxonomy:${taxonomy.name}`} title={taxonomy.label}>
      <FormField
        control={control}
        name={`terms.${taxonomy.name}`}
        render={({ field }) => {
          // rhf returns whatever's at `terms.<taxonomy>`; default to []
          // when the form was initialised without this taxonomy.
          const ids =
            (field.value as readonly number[] | undefined) ?? EMPTY_NUMBER_IDS;
          return (
            <FormItem>
              <FormLabel className="sr-only">{taxonomy.label}</FormLabel>
              <FormControl>
                <MultiSelect
                  options={options}
                  value={ids.map(String)}
                  onChange={(next) => {
                    field.onChange(next.map(Number));
                  }}
                  placeholder={`Add ${pluralLower}…`}
                  searchPlaceholder={`Search ${pluralLower}…`}
                  emptyText={`No ${pluralLower} match.`}
                  testId={`post-editor-taxonomy-${taxonomy.name}`}
                  disabled={disabled}
                  className="w-full"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          );
        }}
      />
    </RailSection>
  );
}
