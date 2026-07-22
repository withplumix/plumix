import type { MetaFieldServerError } from "@/lib/meta-field-errors.js";
import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentSettingsPanel } from "@/components/editor/document-settings.js";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import {
  AUTOSAVE_DEBOUNCE_MS,
  classifyAutosaveError,
} from "@/editor/autosave.js";
import { createDebouncer } from "@/editor/debounce.js";
import { detectStaleAutosave } from "@/editor/detect-stale-autosave.js";
import { registerCoreBlocks } from "@/editor/register-core-blocks.js";
import {
  resolveEditorMode,
  supportsEditor,
  supportsRevisions,
} from "@/editor/resolve-editor-mode.js";
import { resolvePluginFieldType } from "@/editor/resolve-plugin-field-type.js";
import { PreviewBanner } from "@/editor/revisions/PreviewBanner.js";
import { StaleDraftDialog } from "@/editor/StaleDraftDialog.js";
import { ENTRIES_LIST_DEFAULT_SEARCH } from "@/lib/entries.js";
import {
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
import { ORPCError } from "@orpc/client";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";

import type { EntryContent } from "@plumix/blocks";
import type { Label } from "@plumix/core/i18n";
import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import { PlumixEditor } from "@plumix/admin-editor";
import {
  createBlockRegistry,
  defineEntryContent,
  isEntryContent,
} from "@plumix/blocks";
import { NAMED_TEMPLATE_META_KEY } from "@plumix/core/manifest";
import { idPathParam } from "@plumix/core/validation";

import { PlainFormRouteInner } from "./-plain-form-route.js";

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
  revisionConflict: defineMessage({
    id: "editor.revision.conflict",
    message: "This entry changed since the preview loaded — reload and retry.",
  }),
} satisfies Record<string, MessageDescriptor>;

// Core + plugin blocks supply the inspector's input schemas. Built once at
// module load.
registerCoreBlocks();
const registry = createBlockRegistry(getRegisteredBlocks());

// Theme + plugin patterns, surfaced in the inserter alongside the blocks.
const patterns = getPatterns();

// Theme breakpoints sizing the editor's device-switch canvas widths.
const breakpoints = getThemeBreakpoints();

// Theme tokens offered in the Styles tab's token-or-custom controls.
const themeTokens = getThemeTokens();

// Mint once and cache forever — each call writes a fresh preview token, and
// the URL it returns is the canvas iframe's target for the editor's lifetime.
const previewLinkQuery = (
  id: number,
): ReturnType<typeof orpc.entry.createPreviewLink.queryOptions> =>
  orpc.entry.createPreviewLink.queryOptions({
    input: { id },
    staleTime: Infinity,
  });

// The visual editor. The entry load and the preview mint both run in
// the loader so a failure (unreadable entry, no public url) surfaces through
// one ErrorScreen rather than a dead canvas.
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
    // Only the visual canvas (and the revision preview) loads the public route
    // behind a minted preview link; non-editor types render the plain form,
    // which has no canvas, so skip the mint (a structured-record type may have
    // no public URL to mint against). The gate decides whether to include the
    // mint, not when — the entry load and the mint have no data dependency.
    const entryType = findEntryTypeBySlug(params.slug);
    await Promise.all([
      context.queryClient.ensureQueryData(
        orpc.entry.get.queryOptions({
          input: { id: params.id, preview: true },
        }),
      ),
      ...(supportsEditor(entryType)
        ? [context.queryClient.ensureQueryData(previewLinkQuery(params.id))]
        : []),
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
  // The store seeds once (uncontrolled), so the canvas only re-seeds on a
  // remount. The preview source flip covers load-time-draft publish/discard
  // (autosave↔live); `reseedNonce` covers the in-session case where discarding
  // a freshly-made draft leaves the source at "live" (no flip) — the inner
  // bumps it so the canvas drops the discarded edits.
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

// Persistence lives inline in the component (not a custom hook) so the React
// Compiler can optimize it.

// Content + excerpt + meta ride one debounced autosave-row write; slug + parent
// ride a second debouncer that writes the live row (`saveAs: "live"`). Both
// share one optimistic-concurrency token, refreshed on a stale conflict.
function EntryEditor({
  capabilities,
  entryType,
  userId,
  onReseed,
}: EntryEditorProps): ReactNode {
  const { slug, id } = Route.useParams();
  const navigate = useNavigate();
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id, preview: true } }),
  );
  const { data: previewLink } = useSuspenseQuery(previewLinkQuery(id));
  const queryClient = useQueryClient();
  const renderLabel = useLabel();
  const entryTypeName = entryType?.name;
  const capabilitySet = useMemo(() => new Set(capabilities), [capabilities]);
  const [hasLocalDraft, setHasLocalDraft] = useState(false);

  const liveUpdatedAtRef = useRef<Date>(entry.updatedAt);
  // Latches once an autosave genuinely fails so the author is told exactly once
  // (not on every debounce tick); cleared on the next successful save.
  const autosaveFailedRef = useRef(false);
  // Path-addressed meta rejections from the last failed autosave —
  // rendered inline on the document panel's metabox inputs.
  const [metaFieldErrors, setMetaFieldErrors] = useState<
    readonly MetaFieldServerError[] | null
  >(null);
  const seedContent = isEntryContent(entry.content)
    ? entry.content
    : defineEntryContent([]);
  const contentRef = useRef<EntryContent>(seedContent);
  const lastSavedContentRef = useRef<string>(
    JSON.stringify(seedContent.blocks),
  );
  const [excerpt, setExcerpt] = useState<string>(entry.excerpt ?? "");
  const excerptRef = useRef(excerpt);
  const lastSavedExcerptRef = useRef<string>(entry.excerpt ?? "");
  const metaRef = useRef<Record<string, unknown>>(entry.meta);
  const lastSavedMetaRef = useRef<string>(JSON.stringify(entry.meta));
  // Named-template pick — a reserved meta key, but sent as the dedicated
  // `template` field (the meta bag sanitizer rejects reserved keys). `null`
  // = theme default. Rides the same autosave debouncer as content/meta.
  const rawTemplate = entry.meta[NAMED_TEMPLATE_META_KEY];
  const initialTemplate = typeof rawTemplate === "string" ? rawTemplate : null;
  const [templateValue, setTemplateValue] = useState<string | null>(
    initialTemplate,
  );
  const templateRef = useRef<string | null>(initialTemplate);
  const lastSavedTemplateRef = useRef<string | null>(initialTemplate);
  const [titleValue, setTitleValue] = useState<string>(entry.title);
  const [slugValue, setSlugValue] = useState<string>(entry.slug);
  const [parentValue, setParentValue] = useState<number | null>(entry.parentId);
  const titleRef = useRef(titleValue);
  const slugRef = useRef(slugValue);
  const parentRef = useRef(parentValue);
  const lastSavedTitleRef = useRef<string>(entry.title);
  const lastSavedSlugRef = useRef<string>(entry.slug);
  const lastSavedParentRef = useRef<number | null>(entry.parentId);
  // Taxonomies registered against this entry type that the user can assign to
  // (the editor picker writes assignments, so `:assign` — not just `:read` — is
  // the gate; an unassignable taxonomy would only fail the save). Selections are
  // kept as string ids (the MultiSelect's value form), mirrored into `termsRef`.
  const taxonomies = useMemo(() => {
    const allowed = new Set(entryType?.termTaxonomies ?? []);
    return visibleTermTaxonomies(capabilities).filter(
      (t) => allowed.has(t.name) && capabilitySet.has(`term:${t.name}:assign`),
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
  // Last-saved selection per taxonomy, so the debouncer can send ONLY the
  // taxonomies that changed (the patch replaces per-taxonomy; sending unchanged
  // ones would needlessly delete+reinsert their rows).
  const lastSavedTermsRef = useRef<Record<string, string[]>>(termSelections);
  useEffect(() => {
    excerptRef.current = excerpt;
    titleRef.current = titleValue;
    slugRef.current = slugValue;
    parentRef.current = parentValue;
    termsRef.current = termSelections;
    templateRef.current = templateValue;
  });

  // Surface a genuine autosave failure so a rejected save (e.g. content
  // referencing an unknown block) isn't silently swallowed and lost; a
  // recoverable stale-token conflict just re-anchors and stays quiet.
  const handleAutosaveError = useCallback(
    async (err: unknown): Promise<void> => {
      const outcome = await classifyAutosaveError(err, queryClient, id);
      if (outcome.kind === "recovered") {
        if (outcome.updatedAt) liveUpdatedAtRef.current = outcome.updatedAt;
        return;
      }
      // Meta constraint rejections carry field paths — pin them onto
      // the document panel's inputs alongside the one-time toast.
      setMetaFieldErrors(extractMetaFieldErrors(err) ?? null);
      if (!autosaveFailedRef.current) {
        autosaveFailedRef.current = true;
        toastError(renderLabel(M.autosaveFailed));
      }
    },
    [queryClient, id, renderLabel],
  );

  /* eslint-disable react-hooks/refs -- callbacks fire post-keystroke, not during render */
  const contentDebouncer = useMemo(
    () =>
      createDebouncer(async () => {
        const blocks = contentRef.current.blocks;
        const serializedBlocks = JSON.stringify(blocks);
        const contentChanged = serializedBlocks !== lastSavedContentRef.current;
        const nextExcerpt = excerptRef.current;
        const excerptChanged = nextExcerpt !== lastSavedExcerptRef.current;
        const serializedMeta = JSON.stringify(metaRef.current);
        const metaChanged = serializedMeta !== lastSavedMetaRef.current;
        const nextTemplate = templateRef.current;
        const templateChanged = nextTemplate !== lastSavedTemplateRef.current;
        if (
          !contentChanged &&
          !excerptChanged &&
          !metaChanged &&
          !templateChanged
        )
          return;
        try {
          const updated = await orpc.entry.update.call({
            id,
            ...(contentChanged
              ? { content: { version: "plumix.v2", blocks } }
              : {}),
            ...(excerptChanged
              ? { excerpt: nextExcerpt.length === 0 ? null : nextExcerpt }
              : {}),
            ...(metaChanged ? { meta: metaRef.current } : {}),
            ...(templateChanged ? { template: nextTemplate } : {}),
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          if (updated.type === entry.type) {
            liveUpdatedAtRef.current = updated.updatedAt;
          } else {
            // The write landed on the per-user autosave row — a pending draft
            // now exists. Surface it so the draft actions wake without a reload.
            setHasLocalDraft(true);
          }
          if (contentChanged) lastSavedContentRef.current = serializedBlocks;
          if (excerptChanged) lastSavedExcerptRef.current = nextExcerpt;
          if (metaChanged) lastSavedMetaRef.current = serializedMeta;
          if (templateChanged) lastSavedTemplateRef.current = nextTemplate;
          autosaveFailedRef.current = false;
          setMetaFieldErrors(null);
        } catch (err) {
          await handleAutosaveError(err);
        }
      }, AUTOSAVE_DEBOUNCE_MS),
    [id, entry.type, handleAutosaveError],
  );
  const structuralDebouncer = useMemo(
    () =>
      createDebouncer(async () => {
        const nextTitle = titleRef.current.trim();
        const nextSlug = slugRef.current.trim();
        const nextParent = parentRef.current;
        const nextTerms = termsRef.current;
        const savedTerms = lastSavedTermsRef.current;
        const changedTaxonomies = Object.keys(nextTerms).filter(
          (tax) =>
            JSON.stringify(nextTerms[tax]) !==
            JSON.stringify(savedTerms[tax] ?? []),
        );
        const titleChanged =
          nextTitle.length > 0 && nextTitle !== lastSavedTitleRef.current;
        const slugChanged =
          nextSlug.length > 0 && nextSlug !== lastSavedSlugRef.current;
        const parentChanged = nextParent !== lastSavedParentRef.current;
        const termsChanged = changedTaxonomies.length > 0;
        if (!titleChanged && !slugChanged && !parentChanged && !termsChanged) {
          return;
        }
        const termsPatch = Object.fromEntries(
          changedTaxonomies.map((tax) => [
            tax,
            (nextTerms[tax] ?? []).map(Number),
          ]),
        );
        try {
          const updated = await orpc.entry.update.call({
            id,
            ...(titleChanged ? { title: nextTitle } : {}),
            ...(slugChanged ? { slug: nextSlug } : {}),
            ...(parentChanged ? { parentId: nextParent } : {}),
            ...(termsChanged ? { terms: termsPatch } : {}),
            saveAs: "live",
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          liveUpdatedAtRef.current = updated.updatedAt;
          if (titleChanged) lastSavedTitleRef.current = updated.title;
          if (slugChanged) lastSavedSlugRef.current = updated.slug;
          if (parentChanged) lastSavedParentRef.current = updated.parentId;
          if (termsChanged) {
            lastSavedTermsRef.current = {
              ...savedTerms,
              ...Object.fromEntries(
                changedTaxonomies.map((tax) => [tax, nextTerms[tax] ?? []]),
              ),
            };
          }
          autosaveFailedRef.current = false;
        } catch (err) {
          await handleAutosaveError(err);
        }
      }, AUTOSAVE_DEBOUNCE_MS),
    [id, handleAutosaveError],
  );
  /* eslint-enable react-hooks/refs */
  useEffect(
    () => () => {
      void contentDebouncer.flush();
      void structuralDebouncer.flush();
    },
    [contentDebouncer, structuralDebouncer],
  );

  const handleChange = useCallback(
    (content: EntryContent): void => {
      contentRef.current = content;
      contentDebouncer.call();
    },
    [contentDebouncer],
  );
  const handleTitleChange = useCallback(
    (next: string): void => {
      setTitleValue(next);
      structuralDebouncer.call();
    },
    [structuralDebouncer, setTitleValue],
  );
  const handleSlugChange = useCallback(
    (next: string): void => {
      setSlugValue(next);
      structuralDebouncer.call();
    },
    [structuralDebouncer, setSlugValue],
  );
  const handleParentChange = useCallback(
    (next: number | null): void => {
      setParentValue(next);
      structuralDebouncer.call();
    },
    [structuralDebouncer, setParentValue],
  );
  const handleTermsChange = useCallback(
    (taxonomy: string, next: readonly string[]): void => {
      setTermSelections((prev) => ({ ...prev, [taxonomy]: [...next] }));
      structuralDebouncer.call();
    },
    [structuralDebouncer, setTermSelections],
  );
  const handleExcerptChange = useCallback(
    (next: string): void => {
      setExcerpt(next);
      contentDebouncer.call();
    },
    [contentDebouncer, setExcerpt],
  );
  const handleMetaChange = useCallback(
    (next: Record<string, unknown>): void => {
      metaRef.current = next;
      if (JSON.stringify(next) === lastSavedMetaRef.current) return;
      contentDebouncer.call();
    },
    [contentDebouncer],
  );
  const handleTemplateChange = useCallback(
    (next: string | null): void => {
      templateRef.current = next;
      setTemplateValue(next);
      contentDebouncer.call();
    },
    [contentDebouncer, setTemplateValue],
  );
  const handleBack = useCallback(async (): Promise<void> => {
    // Flush pending autosaves before leaving so edits made within the debounce
    // window aren't dropped when the route unmounts.
    await Promise.all([contentDebouncer.flush(), structuralDebouncer.flush()]);
    await navigate({
      to: "/entries/$slug",
      params: { slug },
      search: ENTRIES_LIST_DEFAULT_SEARCH,
    });
  }, [contentDebouncer, structuralDebouncer, navigate, slug]);

  const metaBoxes = useMemo(
    () =>
      entryTypeName ? entryMetaBoxesForType(entryTypeName, capabilities) : [],
    [entryTypeName, capabilities],
  );
  const templateOptions = useMemo(
    () => (entryTypeName ? namedTemplatesForType(entryTypeName) : []),
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
  const publish = useMutation({
    mutationFn: async () => {
      const updated = await orpc.entry.update.call({
        id,
        status: "published",
        expectedLiveUpdatedAt: liveUpdatedAtRef.current,
      });
      liveUpdatedAtRef.current = updated.updatedAt;
      return updated;
    },
    onSuccess: () => {
      // A successful manual save persisted the content, so re-arm the autosave
      // failure latch — otherwise a later genuine autosave failure stays quiet.
      autosaveFailedRef.current = false;
      toastSuccess(renderLabel(M.published));
      return invalidateEntry();
    },
    onError: () => toastError(renderLabel(M.publishFailed)),
  });
  const publishDraft = useMutation({
    mutationFn: () =>
      orpc.entry.publish.call({
        id,
        expectedLiveUpdatedAt: liveUpdatedAtRef.current,
      }),
    onSuccess: async (updated) => {
      autosaveFailedRef.current = false;
      toastSuccess(renderLabel(M.published));
      liveUpdatedAtRef.current = updated.updatedAt;
      setHasLocalDraft(false);
      await invalidateEntry();
    },
    onError: () => toastError(renderLabel(M.publishFailed)),
  });
  const discardDraft = useMutation({
    mutationFn: () => orpc.entry.discardDraft.call({ id }),
    onSuccess: async () => {
      toastSuccess(renderLabel(M.discarded));
      setHasLocalDraft(false);
      await invalidateEntry();
      // Drop any pending write so the unmount flush can't re-save the
      // discarded edits, then remount to reseed the canvas from the live row.
      contentDebouncer.cancel();
      structuralDebouncer.cancel();
      onReseed();
    },
    onError: () => toastError(renderLabel(M.discardFailed)),
  });

  const handlePublish = useCallback(() => publish.mutate(), [publish]);
  const handleSaveDraft = useCallback(
    () => contentDebouncer.flush(),
    [contentDebouncer],
  );
  const handlePublishDraft = useCallback(
    () => publishDraft.mutate(),
    [publishDraft],
  );
  const handleDiscardDraft = useCallback(
    () => discardDraft.mutate(),
    [discardDraft],
  );
  const handleUseMine = useCallback(() => {
    if (liveAnchorAfterResolve)
      liveUpdatedAtRef.current = liveAnchorAfterResolve;
    setStaleResolved(true);
  }, [liveAnchorAfterResolve]);
  const handleUseTheirs = useCallback(() => {
    discardDraft.mutate(undefined, {
      onSuccess: () => setStaleResolved(true),
    });
  }, [discardDraft]);

  const publishActions = useMemo(
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

  // `createPreviewLink` returns a site-relative url (`/blog/hello?preview=…`);
  // resolve it against the admin's own origin (the public site is same-origin).
  // The shareable draft-preview link is that token URL as-is; the canvas reuses
  // it with `plumix.edit` flipped on so the public render boots the runtime.
  const target = new URL(previewLink.url, window.location.origin);
  // The shareable draft-preview link is the token URL as-is (captured before
  // the edit flag is added); the canvas reuses the same URL with `plumix.edit`.
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
      overlay={overlay}
      onRefreshBlockLoader={(blockId) =>
        orpc.entry.refreshBlockLoader.call({ id, blockId }).then((r) => r.data)
      }
      resolvePluginFieldType={resolvePluginFieldType}
    />
  );
}

// Opens a past revision read-only in the same editor, with a banner offering
// "back to live" and restore. Restore reuses the shared revisions RPC (which
// lands on the caller's autosave row for autosave types, or the live row with
// an optimistic-concurrency token for legacy types), then returns to live.
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
  // Gate on the live entry too: its `updatedAt` is the restore concurrency
  // token, so Restore must not be clickable until it's loaded (an undefined
  // token would skip the stale-check on the legacy live-write path).
  if (!revision || !liveQuery.data) return <PendingScreen />;

  const target = new URL(previewLink.url, window.location.origin);
  target.searchParams.set("plumix.edit", "");

  const restoreErrorLabel: Label | null =
    restore.error instanceof ORPCError && restore.error.code === "CONFLICT"
      ? M.revisionConflict
      : restore.error instanceof Error
        ? restore.error.message
        : null;
  const restoreError =
    restoreErrorLabel !== null ? renderLabel(restoreErrorLabel) : null;
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
