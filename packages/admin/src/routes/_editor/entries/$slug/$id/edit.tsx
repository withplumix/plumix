import type { MetaFieldServerError } from "@/lib/meta-field-errors.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentSettingsPanel } from "@/components/editor/document-settings.js";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import { createDebouncer } from "@/editor/debounce.js";
import { detectStaleAutosave } from "@/editor/detect-stale-autosave.js";
import { diffMetaBag } from "@/editor/meta-diff.js";
import {
  resolveEditorMode,
  supportsEditor,
  supportsRevisions,
} from "@/editor/resolve-editor-mode.js";
import { resolvePluginFieldType } from "@/editor/resolve-plugin-field-type.js";
import { PreviewBanner } from "@/editor/revisions/PreviewBanner.js";
import { useRevisionsTrigger } from "@/editor/revisions/use-revisions-trigger.js";
import { StaleDraftDialog } from "@/editor/StaleDraftDialog.js";
import { useEntryAutosave } from "@/editor/use-entry-autosave.js";
import { ENTRIES_LIST_DEFAULT_SEARCH } from "@/lib/entries.js";
import {
  accessPoliciesForType,
  entryMetaBoxesForType,
  findEntryTypeBySlug,
  getPatterns,
  getThemeBreakpoints,
  getThemeTokens,
  namedTemplatesForType,
  visibleTermTaxonomies,
} from "@/lib/manifest.js";
import { extractMetaFieldErrors } from "@/lib/meta-field-errors.js";
import { orpc } from "@/lib/orpc.js";
import { getRegisteredBlocks } from "@/lib/plugin-registry.js";
import { buildEditorTermOptions } from "@/lib/terms.js";
import { toastError, toastSuccess } from "@/lib/toast.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import * as v from "valibot";

import type { PublishActions } from "@plumix/admin-editor";
import type { ResolvedMeta } from "@plumix/core";
import type { EntryContent } from "@plumix/core/blocks";
import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import { PlumixEditor } from "@plumix/admin-editor";
import {
  coreBlocks,
  createBlockRegistry,
  defineEntryContent,
  isEntryContent,
} from "@plumix/core/blocks";
import {
  ACCESS_POLICY_META_KEY,
  NAMED_TEMPLATE_META_KEY,
  termTaxonomyCapability,
} from "@plumix/core/manifest";
import { idPathParam } from "@plumix/core/validation";

import { PlainFormRouteInner } from "./-plain-form-route.js";
import { restoreErrorDescriptor } from "./-restore-error.js";

const M = {
  published: defineMessage({
    id: "editor.toast.published",
    message: "Published.",
  }),
  publishFailed: defineMessage({
    id: "editor.toast.publishFailed",
    message: "Couldn't publish — try again.",
  }),
  autosaveFailed: defineMessage({
    id: "editor.toast.autosaveFailed",
    message: "Couldn't save your changes — they may contain invalid content.",
  }),
  discarded: defineMessage({
    id: "editor.toast.discarded",
    message: "Draft discarded.",
  }),
  discardFailed: defineMessage({
    id: "editor.toast.discardFailed",
    message: "Couldn't discard the draft — try again.",
  }),
  staleLoading: defineMessage({
    id: "editor.stale.loading",
    message: "Loading…",
  }),
} satisfies Record<string, MessageDescriptor>;

/**
 * Only the component reads it, so the code-splitter moves it and every core
 * block out of the entry chunk.
 */
const registry = createBlockRegistry([...coreBlocks, ...getRegisteredBlocks()]);

/** Theme + plugin patterns, surfaced in the inserter alongside the blocks. */
const patterns = getPatterns();

/** Theme breakpoints sizing the editor's device-switch canvas widths. */
const breakpoints = getThemeBreakpoints();

/** Theme tokens offered in the Styles tab's token-or-custom controls. */
const themeTokens = getThemeTokens();

/**
 * Short: only coalesces writes that land together, after the autosave debounce.
 */
const PREVIEW_REFRESH_DEBOUNCE_MS = 250;

/**
 * Mint once and cache forever — each call writes a fresh preview token, and
 * the URL it returns is the canvas iframe's target for the editor's lifetime.
 */
const previewLinkQuery = (
  id: number,
): ReturnType<typeof orpc.entry.createPreviewLink.queryOptions> =>
  orpc.entry.createPreviewLink.queryOptions({
    input: { id },
    staleTime: Infinity,
  });

const editorSearch = v.object({
  // Opening `?revision=<id>` views that past revision read-only with a restore
  // banner; absent → the normal editing session.
  revision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

export const Route = createFileRoute("/_editor/entries/$slug/$id/edit")({
  params: {
    parse: (raw) => {
      const result = v.safeParse(idPathParam, raw.id);
      if (!result.success) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
        throw notFound();
      }
      return { slug: raw.slug, id: result.output };
    },
  },
  validateSearch: editorSearch,
  loader: async ({ context, params }) => {
    // Load and mint run together so a failure surfaces in one ErrorScreen. The
    // plain form skips the mint: its type may have no public URL.
    const entryType = findEntryTypeBySlug(params.slug);
    await Promise.all([
      context.queryClient.query({
        ...orpc.entry.get.queryOptions({
          input: { id: params.id, preview: true },
        }),
        staleTime: "static",
      }),
      supportsEditor(entryType)
        ? context.queryClient.query({
            ...previewLinkQuery(params.id),
            staleTime: "static",
          })
        : undefined,
    ]);
  },
  pendingComponent: PendingScreen,
  errorComponent: ErrorScreen,
  component: EditorRoute,
});

function PendingScreen(): ReactNode {
  return (
    <div
      className="text-muted-foreground p-6 text-sm"
      data-testid="plumix-editor-loading"
    >
      <Trans id="editor.loading" message="Opening the editor…" />
    </div>
  );
}

function ErrorScreen(): ReactNode {
  return (
    <ErrorPlaceholder
      testId="plumix-editor-error"
      title={
        <Trans
          id="editor.previewFailedTitle"
          message="Couldn't open the editor"
        />
      }
      description={
        <Trans
          id="editor.previewFailed"
          message="Couldn't open this entry in the editor."
        />
      }
    />
  );
}

function EditorRoute(): ReactNode {
  const { slug, id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { revision } = Route.useSearch();
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id, preview: true } }),
  );
  // The store seeds once, so only a remount re-seeds. Discarding a fresh draft
  // leaves the source at "live", so this nonce forces it.
  const [reseedNonce, setReseedNonce] = useState(0);
  const reseed = useCallback(() => setReseedNonce((n) => n + 1), []);

  // A `?revision=<id>` request opens that revision read-only with a restore
  // banner — keyed so leaving/entering preview re-seeds the canvas.
  if (revision !== undefined) {
    return (
      <RevisionPreview
        key={`revision:${String(revision)}`}
        id={id}
        revisionId={revision}
        capabilities={user.capabilities}
      />
    );
  }
  const entryType = findEntryTypeBySlug(slug);
  // Non-editor entry types (structured records like authors, products, events)
  // get the plain-form Cards layout instead of the visual canvas, driven by the
  // manifest `supports` decision.
  if (!supportsEditor(entryType) && entryType) {
    return (
      <PlainFormRouteInner
        entryType={entryType}
        id={id}
        supportsRevisions={supportsRevisions(entryType)}
        capabilities={user.capabilities}
      />
    );
  }
  const previewSource = entry._preview?.source ?? "live";
  // Pass capabilities + entryType + userId across a prop boundary so the React
  // Compiler treats them as stable inputs (member/derived reads inline read as
  // possibly-mutated, which forces the compiler to skip optimizing).
  return (
    <EntryEditor
      key={`${previewSource}:${reseedNonce}`}
      capabilities={user.capabilities}
      entryType={entryType}
      userId={user.id}
      onReseed={reseed}
    />
  );
}

interface EntryEditorProps {
  readonly capabilities: readonly string[];
  readonly entryType: EntryTypeManifestEntry | undefined;
  readonly userId: number;
  readonly onReseed: () => void;
}

/** Content + excerpt + meta + template + access, as one autosave-row write. */
interface ContentSnapshot {
  readonly blocks: EntryContent["blocks"];
  readonly serializedBlocks: string;
  readonly excerpt: string;
  readonly meta: ResolvedMeta;
  readonly template: string | null;
  readonly access: string | null;
}

/**
 * Title + slug + parent + terms, written to the live row (`saveAs: "live"`).
 */
interface StructuralSnapshot {
  readonly title: string;
  readonly slug: string;
  readonly parentId: number | null;
  readonly terms: Readonly<Record<string, readonly string[]>>;
}

/**
 * What changed between the last-saved structural fields and `next`. A blank
 * title or slug is never sent: the author is mid-edit, not clearing it.
 */
function structuralChanges(
  saved: StructuralSnapshot,
  next: StructuralSnapshot,
): {
  readonly title: boolean;
  readonly slug: boolean;
  readonly parentId: boolean;
  readonly taxonomies: readonly string[];
} {
  return {
    title: next.title.length > 0 && next.title !== saved.title,
    slug: next.slug.length > 0 && next.slug !== saved.slug,
    parentId: next.parentId !== saved.parentId,
    taxonomies: Object.keys(next.terms).filter(
      (tax) =>
        JSON.stringify(next.terms[tax]) !==
        JSON.stringify(saved.terms[tax] ?? []),
    ),
  };
}

/**
 * Content + excerpt + meta ride one debounced autosave-row write; slug + parent
 * ride a second group that writes the live row. `useEntryAutosave` runs both
 * behind one optimistic-concurrency token.
 */
function EntryEditor({
  capabilities,
  entryType,
  userId,
  onReseed,
}: EntryEditorProps): ReactNode {
  const { slug, id } = Route.useParams();
  // Route-scoped so the `?revision=<id>` search updater is typed against this
  // route's search schema (the bare `useNavigate` infers it as `never`).
  const navigate = Route.useNavigate();
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id, preview: true } }),
  );
  const { data: previewLink } = useSuspenseQuery(previewLinkQuery(id));
  const queryClient = useQueryClient();
  const renderLabel = useLabel();
  const entryTypeName = entryType?.name;
  const capabilitySet = useMemo(() => new Set(capabilities), [capabilities]);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);
  // Bumped after a template-rendered field (title/excerpt/meta/template)
  // autosaves; reloads the canvas so those fields — which live in the
  // server-rendered shell, not the block store the bridge pushes — refresh.
  const [previewRefreshToken, setPreviewRefreshToken] = useState(0);

  // Path-addressed meta rejections from the last failed autosave —
  // rendered inline on the document panel's metabox inputs.
  const [metaFieldErrors, setMetaFieldErrors] = useState<
    readonly MetaFieldServerError[] | null
  >(null);
  const seedContent = isEntryContent(entry.content)
    ? entry.content
    : defineEntryContent([]);
  const contentRef = useRef<EntryContent>(seedContent);
  const [excerpt, setExcerpt] = useState<string>(entry.excerpt ?? "");
  const excerptRef = useRef(excerpt);
  const metaBoxes = useMemo(
    () =>
      entryTypeName ? entryMetaBoxesForType(entryTypeName, capabilities) : [],
    [entryTypeName, capabilities],
  );
  const metaRef = useRef<Record<string, unknown>>(entry.meta);
  // Named-template pick — a reserved meta key, but sent as the dedicated
  // `template` field (the meta bag sanitizer rejects reserved keys). `null`
  // = theme default. Rides the same autosave group as content/meta.
  const rawTemplate = entry.meta[NAMED_TEMPLATE_META_KEY];
  const initialTemplate = typeof rawTemplate === "string" ? rawTemplate : null;
  const [templateValue, setTemplateValue] = useState<string | null>(
    initialTemplate,
  );
  const templateRef = useRef<string | null>(initialTemplate);
  // Per-entry visibility pick — same reserved-key / dedicated-field mechanics
  // as the template choice, sent as the `access` update field. `null` = the
  // entry type's default policy. Rides the same autosave group.
  const rawAccess = entry.meta[ACCESS_POLICY_META_KEY];
  const initialAccess = typeof rawAccess === "string" ? rawAccess : null;
  const [accessValue, setAccessValue] = useState<string | null>(initialAccess);
  const accessRef = useRef<string | null>(initialAccess);
  const [titleValue, setTitleValue] = useState<string>(entry.title);
  const [slugValue, setSlugValue] = useState<string>(entry.slug);
  const [parentValue, setParentValue] = useState<number | null>(entry.parentId);
  const titleRef = useRef(titleValue);
  const slugRef = useRef(slugValue);
  const parentRef = useRef(parentValue);
  // Gated on `:assign`, not `:read`: an unassignable taxonomy would only fail
  // the save.
  const taxonomies = useMemo(() => {
    const allowed = new Set(entryType?.termTaxonomies ?? []);
    return visibleTermTaxonomies(capabilities).filter(
      (t) =>
        allowed.has(t.name) &&
        capabilitySet.has(termTaxonomyCapability(t, "assign")),
    );
  }, [entryType, capabilities, capabilitySet]);
  const [termSelections, setTermSelections] = useState<
    Record<string, string[]>
  >(() =>
    Object.fromEntries(
      taxonomies.map((t) => [t.name, (entry.terms[t.name] ?? []).map(String)]),
    ),
  );
  const termsRef = useRef<Record<string, string[]>>(termSelections);
  useEffect(() => {
    excerptRef.current = excerpt;
    titleRef.current = titleValue;
    slugRef.current = slugValue;
    parentRef.current = parentValue;
    termsRef.current = termSelections;
    templateRef.current = templateValue;
    accessRef.current = accessValue;
  });

  const refreshPreview = useMemo(
    () =>
      createDebouncer(
        () => setPreviewRefreshToken((token) => token + 1),
        PREVIEW_REFRESH_DEBOUNCE_MS,
      ),
    [],
  );
  useEffect(() => () => refreshPreview.cancel(), [refreshPreview]);

  const autosave = useEntryAutosave({
    id,
    entryType: entry.type,
    liveUpdatedAt: entry.updatedAt,
    onError: (err) => {
      setMetaFieldErrors(extractMetaFieldErrors(err) ?? null);
      toastError(renderLabel(M.autosaveFailed));
    },
    groups: {
      content: {
        initial: {
          blocks: seedContent.blocks,
          serializedBlocks: JSON.stringify(seedContent.blocks),
          excerpt: entry.excerpt ?? "",
          meta: entry.meta,
          template: initialTemplate,
          access: initialAccess,
        },
        snapshot: (): ContentSnapshot => {
          const blocks = contentRef.current.blocks;
          return {
            blocks,
            serializedBlocks: JSON.stringify(blocks),
            excerpt: excerptRef.current,
            meta: metaRef.current,
            template: templateRef.current,
            access: accessRef.current,
          };
        },
        diff: (saved: ContentSnapshot, next: ContentSnapshot) => {
          const contentChanged =
            next.serializedBlocks !== saved.serializedBlocks;
          const excerptChanged = next.excerpt !== saved.excerpt;
          const metaPatch = diffMetaBag(saved.meta, next.meta);
          const metaChanged = Object.keys(metaPatch).length > 0;
          const templateChanged = next.template !== saved.template;
          const accessChanged = next.access !== saved.access;
          if (
            !contentChanged &&
            !excerptChanged &&
            !metaChanged &&
            !templateChanged &&
            !accessChanged
          )
            return null;
          return {
            ...(contentChanged
              ? { content: { version: "plumix.v2", blocks: next.blocks } }
              : {}),
            ...(excerptChanged
              ? { excerpt: next.excerpt.length === 0 ? null : next.excerpt }
              : {}),
            ...(metaChanged ? { meta: metaPatch } : {}),
            ...(templateChanged ? { template: next.template } : {}),
            ...(accessChanged ? { access: next.access } : {}),
          };
        },
        commit: (_saved: ContentSnapshot, next: ContentSnapshot) => next,
        onSaved: (patch, response) => {
          if (response.type !== entry.type) {
            // The write landed on the per-user autosave row — a pending draft
            // now exists. Surface it so the draft actions wake without a
            // reload.
            setHasLocalDraft(true);
          }
          setMetaFieldErrors(null);
          // These render into the server shell, which the bridge doesn't
          // update.
          if (
            patch.excerpt !== undefined ||
            patch.meta !== undefined ||
            patch.template !== undefined
          ) {
            refreshPreview.call();
          }
        },
      },
      structural: {
        initial: {
          title: entry.title,
          slug: entry.slug,
          parentId: entry.parentId,
          terms: termSelections,
        },
        snapshot: (): StructuralSnapshot => ({
          title: titleRef.current.trim(),
          slug: slugRef.current.trim(),
          parentId: parentRef.current,
          terms: termsRef.current,
        }),
        diff: (saved: StructuralSnapshot, next: StructuralSnapshot) => {
          const changed = structuralChanges(saved, next);
          const termsChanged = changed.taxonomies.length > 0;
          if (
            !changed.title &&
            !changed.slug &&
            !changed.parentId &&
            !termsChanged
          ) {
            return null;
          }
          const termsPatch = Object.fromEntries(
            changed.taxonomies.map((tax) => [
              tax,
              (next.terms[tax] ?? []).map(Number),
            ]),
          );
          return {
            ...(changed.title ? { title: next.title } : {}),
            ...(changed.slug ? { slug: next.slug } : {}),
            ...(changed.parentId ? { parentId: next.parentId } : {}),
            ...(termsChanged ? { terms: termsPatch } : {}),
            saveAs: "live",
          };
        },
        commit: (
          saved: StructuralSnapshot,
          next: StructuralSnapshot,
          response,
        ): StructuralSnapshot => {
          const changed = structuralChanges(saved, next);
          return {
            title: changed.title ? response.title : saved.title,
            slug: changed.slug ? response.slug : saved.slug,
            parentId: changed.parentId ? response.parentId : saved.parentId,
            terms: {
              ...saved.terms,
              ...Object.fromEntries(
                changed.taxonomies.map((tax) => [tax, next.terms[tax] ?? []]),
              ),
            },
          };
        },
        // The title / parent / terms render into the theme shell; the slug
        // only affects the permalink (the canvas loads a token URL), so a
        // slug-only save doesn't need a reload.
        onSaved: (patch) => {
          if (
            patch.title !== undefined ||
            patch.parentId !== undefined ||
            patch.terms !== undefined
          ) {
            refreshPreview.call();
          }
        },
      },
    },
  });

  const handleChange = useCallback(
    (content: EntryContent): void => {
      contentRef.current = content;
      autosave.schedule.content();
    },
    [autosave],
  );
  const handleTitleChange = useCallback(
    (next: string): void => {
      setTitleValue(next);
      autosave.schedule.structural();
    },
    [autosave, setTitleValue],
  );
  const handleSlugChange = useCallback(
    (next: string): void => {
      setSlugValue(next);
      autosave.schedule.structural();
    },
    [autosave, setSlugValue],
  );
  const handleParentChange = useCallback(
    (next: number | null): void => {
      setParentValue(next);
      autosave.schedule.structural();
    },
    [autosave, setParentValue],
  );
  const handleTermsChange = useCallback(
    (taxonomy: string, next: readonly string[]): void => {
      setTermSelections((prev) => ({ ...prev, [taxonomy]: [...next] }));
      autosave.schedule.structural();
    },
    [autosave, setTermSelections],
  );
  const handleExcerptChange = useCallback(
    (next: string): void => {
      setExcerpt(next);
      autosave.schedule.content();
    },
    [autosave, setExcerpt],
  );
  const handleMetaChange = useCallback(
    (next: ResolvedMeta): void => {
      metaRef.current = next;
      autosave.schedule.content();
    },
    [autosave],
  );
  const handleTemplateChange = useCallback(
    (next: string | null): void => {
      templateRef.current = next;
      setTemplateValue(next);
      autosave.schedule.content();
    },
    [autosave, setTemplateValue],
  );
  const handleAccessChange = useCallback(
    (next: string | null): void => {
      accessRef.current = next;
      setAccessValue(next);
      autosave.schedule.content();
    },
    [autosave, setAccessValue],
  );
  const handleBack = useCallback(async (): Promise<void> => {
    // Flush pending autosaves before leaving so edits made within the debounce
    // window aren't dropped when the route unmounts.
    await autosave.flush();
    await navigate({
      to: "/entries/$slug",
      params: { slug },
      search: ENTRIES_LIST_DEFAULT_SEARCH,
    });
  }, [autosave, navigate, slug]);

  // `EditorRoute` renders `?revision=<id>` as the read-only `RevisionPreview`,
  // so previewing a revision is a search-param navigation. Mirrors the
  // plain-form editor's history button.
  const handleRevisionPreview = useCallback(
    (revisionId: number): void => {
      void navigate({ search: (prev) => ({ ...prev, revision: revisionId }) });
    },
    [navigate],
  );
  const { trigger: revisionsTrigger, openRevisions } = useRevisionsTrigger({
    entryId: id,
    enabled: supportsRevisions(entryType),
    onPreview: handleRevisionPreview,
    triggerVariant: "icon",
  });

  const templateOptions = useMemo(
    () => (entryTypeName ? namedTemplatesForType(entryTypeName) : []),
    [entryTypeName],
  );
  const accessOptions = useMemo(
    () => (entryTypeName ? accessPoliciesForType(entryTypeName) : []),
    [entryTypeName],
  );
  const supportsTitle =
    // `supports` list code, not a display label.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    entryType?.supports?.includes("title") ?? false;
  const supportsExcerpt =
    // `supports` list code, not a display label.
    // eslint-disable-next-line lingui/no-unlocalized-strings
    entryType?.supports?.includes("excerpt") ?? false;
  const isHierarchical = entryType?.isHierarchical === true;
  const parentCandidates = useQuery({
    ...orpc.entry.list.queryOptions({
      input: {
        type: entryTypeName ?? "",
        limit: 100,
        // SQL column picklist code, not a display label.
        // eslint-disable-next-line lingui/no-unlocalized-strings
        orderBy: "title",
        order: "asc",
      },
    }),
    enabled: isHierarchical && entryTypeName !== undefined,
  });
  const parentOptions = useMemo(
    () =>
      (parentCandidates.data ?? [])
        .filter((candidate) => candidate.id !== id)
        .map((candidate) => ({ id: candidate.id, title: candidate.title })),
    [parentCandidates.data, id],
  );
  // One batched fetch per taxonomy (useQueries, not a per-item useQuery loop).
  const termQueries = useQueries({
    queries: taxonomies.map((taxonomy) => ({
      ...orpc.term.list.queryOptions({
        input: { taxonomy: taxonomy.name, limit: 200 },
      }),
    })),
  });
  const taxonomyPickers = useMemo(
    () =>
      taxonomies.map((taxonomy, index) => ({
        name: taxonomy.name,
        label: renderLabel(taxonomy.label),
        options: buildEditorTermOptions(
          termQueries[index]?.data ?? [],
          taxonomy.isHierarchical === true,
        ),
        value: termSelections[taxonomy.name] ?? [],
        onChange: (next: readonly string[]): void =>
          handleTermsChange(taxonomy.name, next),
      })),
    [taxonomies, termQueries, termSelections, handleTermsChange, renderLabel],
  );
  const documentPanel = useMemo(
    () => (
      <DocumentSettingsPanel
        // Title now lives in the editor header, not the Page tab.
        slug={slugValue}
        onSlugChange={handleSlugChange}
        excerpt={
          supportsExcerpt
            ? { value: excerpt, onChange: handleExcerptChange }
            : undefined
        }
        parent={
          isHierarchical
            ? {
                value: parentValue,
                options: parentOptions,
                onChange: handleParentChange,
              }
            : undefined
        }
        template={
          templateOptions.length > 0
            ? {
                value: templateValue,
                options: templateOptions,
                onChange: handleTemplateChange,
              }
            : undefined
        }
        access={
          accessOptions.length > 0
            ? {
                value: accessValue,
                options: accessOptions,
                onChange: handleAccessChange,
              }
            : undefined
        }
        taxonomies={taxonomyPickers.length > 0 ? taxonomyPickers : undefined}
        metaBoxes={
          metaBoxes.length > 0
            ? {
                boxes: metaBoxes,
                initialMeta: entry.meta,
                onMetaChange: handleMetaChange,
                fieldErrors: metaFieldErrors,
              }
            : undefined
        }
      />
    ),
    [
      slugValue,
      handleSlugChange,
      supportsExcerpt,
      excerpt,
      handleExcerptChange,
      isHierarchical,
      parentValue,
      parentOptions,
      handleParentChange,
      templateOptions,
      templateValue,
      handleTemplateChange,
      accessOptions,
      accessValue,
      handleAccessChange,
      taxonomyPickers,
      metaBoxes,
      entry.meta,
      handleMetaChange,
      metaFieldErrors,
    ],
  );

  // Publish / draft / discard. A published entry whose type opts into autosave
  // edits a per-user draft (edit-with-draft); everything else publishes the
  // live row directly. The mutations are the existing admin ones.
  const editorMode = resolveEditorMode({
    entryType,
    currentStatus: entry.status,
    isAuthor: entry.authorId === userId,
    capabilities: capabilitySet,
  });
  const isEditWithDraft = editorMode === "edit-with-draft";
  const isPublished = entry.status === "published";
  const hasPendingDraft =
    entry._preview?.source === "autosave" || hasLocalDraft;
  const staleState = entry._preview
    ? detectStaleAutosave(
        entry._preview.autosaveUpdatedAt,
        entry._preview.liveUpdatedAt,
      )
    : "none";
  const [staleResolved, setStaleResolved] = useState(false);
  const showStaleDialog = staleState === "stale" && !staleResolved;
  const liveAnchorAfterResolve = entry._preview?.liveUpdatedAt;

  const invalidateEntry = useCallback(
    () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({
            input: { id, preview: true },
          }).queryKey,
        }),
        // Keep the entries list + revisions sheet in step with the new status.
        ...(entryTypeName
          ? [
              queryClient.invalidateQueries({
                queryKey: orpc.entry.list.key({
                  input: { type: entryTypeName },
                }),
              }),
              queryClient.invalidateQueries({
                queryKey: ["entry.revisions", id],
              }),
            ]
          : []),
      ]),
    [id, entryTypeName, queryClient],
  );
  // Publish is stricter than a draft save, rejecting values a draft tolerated.
  const handlePublishError = useCallback(
    (err: unknown): void => {
      setMetaFieldErrors(extractMetaFieldErrors(err) ?? null);
      toastError(renderLabel(M.publishFailed));
    },
    [renderLabel],
  );
  // Publishing flushes pending edits first and waits its turn in the save
  // queue, so it neither publishes without the last edit nor races an autosave
  // for the token.
  const publish = useMutation({
    mutationFn: () =>
      autosave.runExclusive((expectedLiveUpdatedAt) =>
        orpc.entry.update.call({
          id,
          status: "published",
          expectedLiveUpdatedAt,
        }),
      ),
    onSuccess: () => {
      // The promoted bag passed the strict gate, so clear any field pins a
      // prior failed publish left behind.
      setMetaFieldErrors(null);
      toastSuccess(renderLabel(M.published));
      return invalidateEntry();
    },
    onError: handlePublishError,
  });
  const publishDraft = useMutation({
    mutationFn: () =>
      autosave.runExclusive((expectedLiveUpdatedAt) =>
        orpc.entry.publish.call({ id, expectedLiveUpdatedAt }),
      ),
    onSuccess: async () => {
      // The promoted bag passed the strict gate, so clear any field pins a
      // prior failed publish left behind.
      setMetaFieldErrors(null);
      toastSuccess(renderLabel(M.published));
      setHasLocalDraft(false);
      await invalidateEntry();
    },
    onError: handlePublishError,
  });
  const discardDraft = useMutation({
    mutationFn: () => orpc.entry.discardDraft.call({ id }),
    onSuccess: async () => {
      toastSuccess(renderLabel(M.discarded));
      setHasLocalDraft(false);
      await invalidateEntry();
      // Drop any pending write so the unmount flush can't re-save the
      // discarded edits, then remount to reseed the canvas from the live row.
      autosave.cancel();
      onReseed();
    },
    onError: () => toastError(renderLabel(M.discardFailed)),
  });

  const handlePublish = useCallback(() => publish.mutate(), [publish]);
  const handleSaveDraft = useCallback(() => void autosave.flush(), [autosave]);
  const handlePublishDraft = useCallback(
    () => publishDraft.mutate(),
    [publishDraft],
  );
  const handleDiscardDraft = useCallback(
    () => discardDraft.mutate(),
    [discardDraft],
  );
  const handleUseMine = useCallback(() => {
    if (liveAnchorAfterResolve) autosave.anchor(liveAnchorAfterResolve);
    setStaleResolved(true);
  }, [autosave, liveAnchorAfterResolve]);
  const handleUseTheirs = useCallback(() => {
    discardDraft.mutate(undefined, {
      onSuccess: () => setStaleResolved(true),
    });
  }, [discardDraft]);

  const publishActions = useMemo<PublishActions>(
    () =>
      isEditWithDraft
        ? {
            draftMode: {
              hasPendingDraft,
              onSaveDraft: handleSaveDraft,
              onPublishDraft: handlePublishDraft,
              onDiscardDraft: handleDiscardDraft,
              isSaving: false,
              isPublishing: publishDraft.isPending,
              isDiscarding: discardDraft.isPending,
            },
          }
        : {
            onPublish: handlePublish,
            isPublished,
            isPublishing: publish.isPending,
          },
    [
      isEditWithDraft,
      hasPendingDraft,
      handleSaveDraft,
      handlePublishDraft,
      handleDiscardDraft,
      publishDraft.isPending,
      discardDraft.isPending,
      handlePublish,
      isPublished,
      publish.isPending,
    ],
  );

  // Live snapshot for the stale-draft compare pane — only fetched while the
  // resolver dialog is open.
  const liveSnapshotQuery = useQuery({
    ...orpc.entry.get.queryOptions({ input: { id } }),
    enabled: showStaleDialog,
  });
  const overlay = (
    <StaleDraftDialog
      open={showStaleDialog}
      autosaveSnapshot={{
        title: entry.title,
        content: entry.content,
        excerpt: entry.excerpt,
      }}
      liveSnapshot={
        liveSnapshotQuery.data
          ? {
              title: liveSnapshotQuery.data.title,
              content: liveSnapshotQuery.data.content,
              excerpt: liveSnapshotQuery.data.excerpt,
            }
          : { title: renderLabel(M.staleLoading), content: null, excerpt: null }
      }
      onUseMine={handleUseMine}
      onUseTheirs={handleUseTheirs}
      isResolving={discardDraft.isPending}
    />
  );

  // The site-relative url resolves against the admin origin: the public site is
  // same-origin.
  const target = new URL(previewLink.url, window.location.origin);
  // Captured before the canvas's `plumix.edit` flag is added.
  const shareUrl = target.toString();
  target.searchParams.set("plumix.edit", "");

  // The published page is the preview URL without the draft token; surfaced as
  // "View live entry" only once the entry has actually been published.
  const liveTarget = new URL(previewLink.url, window.location.origin);
  liveTarget.search = "";
  const liveUrl = isPublished ? liveTarget.toString() : undefined;

  return (
    <PlumixEditor
      previewUrl={target.toString()}
      origin={target.origin}
      defaultValue={isEntryContent(entry.content) ? entry.content : undefined}
      registry={registry}
      capabilities={capabilitySet}
      patterns={patterns}
      entryType={entryTypeName}
      breakpoints={breakpoints}
      tokens={themeTokens}
      previewLink={shareUrl}
      liveUrl={liveUrl}
      title={supportsTitle ? titleValue : undefined}
      onTitleChange={supportsTitle ? handleTitleChange : undefined}
      onBack={() => void handleBack()}
      onChange={handleChange}
      documentPanel={documentPanel}
      publish={publishActions}
      revisionsTrigger={revisionsTrigger}
      onOpenRevisions={openRevisions}
      overlay={overlay}
      onRefreshBlockLoader={(blockId) =>
        orpc.entry.refreshBlockLoader.call({ id, blockId }).then((r) => r.data)
      }
      previewRefreshToken={previewRefreshToken}
      resolvePluginFieldType={resolvePluginFieldType}
    />
  );
}

function RevisionPreview({
  id,
  revisionId,
  capabilities,
}: {
  readonly id: number;
  readonly revisionId: number;
  readonly capabilities: readonly string[];
}): ReactNode {
  const navigate = Route.useNavigate();
  const queryClient = useQueryClient();
  const renderLabel = useLabel();
  const { formatRelative } = useFormatters();
  const capabilitySet = useMemo(() => new Set(capabilities), [capabilities]);
  const { data: previewLink } = useSuspenseQuery(previewLinkQuery(id));
  const revisionQuery = useQuery(
    orpc.entry.revisions.get.queryOptions({ input: { revisionId } }),
  );
  const liveQuery = useQuery(orpc.entry.get.queryOptions({ input: { id } }));

  const handleBackToLive = useCallback(
    () =>
      void navigate({ search: (prev) => ({ ...prev, revision: undefined }) }),
    [navigate],
  );

  const liveUpdatedAt = liveQuery.data?.updatedAt;
  const restore = useMutation({
    mutationFn: () =>
      orpc.entry.revisions.restore.call({
        revisionId,
        // Honored only on the legacy live-write path; the autosave destination
        // ignores it. Pass the live row's token to keep that contract.
        expectedLiveUpdatedAt: liveUpdatedAt,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({
            input: { id, preview: true },
          }).queryKey,
        }),
      ]);
      handleBackToLive();
    },
  });

  const revision = revisionQuery.data;
  // An undefined `updatedAt` token would skip the legacy path's stale-check.
  if (!revision || !liveQuery.data) return <PendingScreen />;

  const target = new URL(previewLink.url, window.location.origin);
  target.searchParams.set("plumix.edit", "");

  const restoreError =
    restore.error === null
      ? null
      : renderLabel(restoreErrorDescriptor(restore.error));
  const revisionAuthor =
    revision.authorName ?? revision.authorEmail ?? `#${String(revisionId)}`;

  return (
    <PlumixEditor
      previewUrl={target.toString()}
      origin={target.origin}
      defaultValue={
        isEntryContent(revision.content) ? revision.content : undefined
      }
      registry={registry}
      capabilities={capabilitySet}
      breakpoints={breakpoints}
      readOnly
      previewBanner={
        <PreviewBanner
          revisionUpdatedAt={revision.updatedAt}
          revisionAuthor={revisionAuthor}
          relativeTime={formatRelative}
          onBackToLive={handleBackToLive}
          onRestore={() => restore.mutate()}
          isRestoring={restore.isPending}
          restoreError={restoreError}
        />
      }
    />
  );
}
