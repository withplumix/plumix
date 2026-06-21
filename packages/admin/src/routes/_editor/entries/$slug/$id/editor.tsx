import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentSettingsPanel } from "@/components/editor/document-settings.js";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import { AUTOSAVE_DEBOUNCE_MS, freshLiveUpdatedAt } from "@/editor/autosave.js";
import { createDebouncer } from "@/editor/debounce.js";
import { detectStaleAutosave } from "@/editor/detect-stale-autosave.js";
import { registerCoreBlocks } from "@/editor/register-core-blocks.js";
import {
  resolveEditorMode,
  supportsEditor,
  supportsRevisions,
} from "@/editor/resolve-editor-mode.js";
import { PreviewBanner } from "@/editor/revisions/PreviewBanner.js";
import { StaleDraftDialog } from "@/editor/StaleDraftDialog.js";
import {
  entryMetaBoxesForType,
  findEntryTypeBySlug,
  getPatterns,
  getThemeBreakpoints,
  getThemeTokens,
} from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { getRegisteredBlocks } from "@/lib/plugin-registry.js";
import { toastError, toastSuccess } from "@/lib/toast.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { ORPCError } from "@orpc/client";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
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
import { idPathParam } from "@plumix/core/validation";

import { PlainFormRouteInner } from "./plain-form-route.js";

const M = {
  published: defineMessage({
    id: "editor.bespoke.toast.published",
    message: "Published.",
  }),
  publishFailed: defineMessage({
    id: "editor.bespoke.toast.publishFailed",
    message: "Couldn't publish — try again.",
  }),
  discarded: defineMessage({
    id: "editor.bespoke.toast.discarded",
    message: "Draft discarded.",
  }),
  discardFailed: defineMessage({
    id: "editor.bespoke.toast.discardFailed",
    message: "Couldn't discard the draft — try again.",
  }),
  staleLoading: defineMessage({
    id: "editor.bespoke.stale.loading",
    message: "Loading…",
  }),
  revisionConflict: defineMessage({
    id: "editor.bespoke.revision.conflict",
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

// The bespoke visual editor. The entry load and the preview mint both run in
// the loader so a failure (unreadable entry, no public url) surfaces through
// one ErrorScreen rather than a dead canvas.
const editorSearch = v.object({
  // Opening `?revision=<id>` views that past revision read-only with a restore
  // banner; absent → the normal editing session.
  revision: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
});

export const Route = createFileRoute("/_editor/entries/$slug/$id/editor")({
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
  component: BespokeEditorRoute,
});

function PendingScreen(): ReactNode {
  return (
    <div
      className="text-muted-foreground p-6 text-sm"
      data-testid="plumix-editor-loading"
    >
      <Trans id="editor.bespoke.loading" message="Opening the editor…" />
    </div>
  );
}

function ErrorScreen(): ReactNode {
  return (
    <ErrorPlaceholder
      testId="plumix-editor-error"
      title={
        <Trans
          id="editor.bespoke.previewFailedTitle"
          message="Couldn't open the editor"
        />
      }
      description={
        <Trans
          id="editor.bespoke.previewFailed"
          message="Couldn't open this entry in the editor."
        />
      }
    />
  );
}

function BespokeEditorRoute(): ReactNode {
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
    <BespokeEditor
      key={`${previewSource}:${reseedNonce}`}
      capabilities={user.capabilities}
      entryType={entryType}
      userId={user.id}
      onReseed={reseed}
    />
  );
}

interface BespokeEditorProps {
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
function BespokeEditor({
  capabilities,
  entryType,
  userId,
  onReseed,
}: BespokeEditorProps): ReactNode {
  const { id } = Route.useParams();
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
  const [slugValue, setSlugValue] = useState<string>(entry.slug);
  const [parentValue, setParentValue] = useState<number | null>(entry.parentId);
  const slugRef = useRef(slugValue);
  const parentRef = useRef(parentValue);
  const lastSavedSlugRef = useRef<string>(entry.slug);
  const lastSavedParentRef = useRef<number | null>(entry.parentId);
  useEffect(() => {
    excerptRef.current = excerpt;
    slugRef.current = slugValue;
    parentRef.current = parentValue;
  });

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
        if (!contentChanged && !excerptChanged && !metaChanged) return;
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
        } catch (err) {
          const fresh = await freshLiveUpdatedAt(err, queryClient, id);
          if (fresh) liveUpdatedAtRef.current = fresh;
        }
      }, AUTOSAVE_DEBOUNCE_MS),
    [id, entry.type, queryClient],
  );
  const structuralDebouncer = useMemo(
    () =>
      createDebouncer(async () => {
        const nextSlug = slugRef.current.trim();
        const nextParent = parentRef.current;
        const slugChanged =
          nextSlug.length > 0 && nextSlug !== lastSavedSlugRef.current;
        const parentChanged = nextParent !== lastSavedParentRef.current;
        if (!slugChanged && !parentChanged) return;
        try {
          const updated = await orpc.entry.update.call({
            id,
            ...(slugChanged ? { slug: nextSlug } : {}),
            ...(parentChanged ? { parentId: nextParent } : {}),
            saveAs: "live",
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          liveUpdatedAtRef.current = updated.updatedAt;
          if (slugChanged) lastSavedSlugRef.current = updated.slug;
          if (parentChanged) lastSavedParentRef.current = updated.parentId;
        } catch (err) {
          const fresh = await freshLiveUpdatedAt(err, queryClient, id);
          if (fresh) liveUpdatedAtRef.current = fresh;
        }
      }, AUTOSAVE_DEBOUNCE_MS),
    [id, queryClient],
  );
  /* eslint-enable react-hooks/refs */
  useEffect(
    () => () => {
      contentDebouncer.flush();
      structuralDebouncer.flush();
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

  const metaBoxes = useMemo(
    () =>
      entryTypeName ? entryMetaBoxesForType(entryTypeName, capabilities) : [],
    [entryTypeName, capabilities],
  );
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
  const documentPanel = useMemo(
    () => (
      <DocumentSettingsPanel
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
        metaBoxes={
          metaBoxes.length > 0
            ? {
                boxes: metaBoxes,
                initialMeta: entry.meta,
                onMetaChange: handleMetaChange,
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
      metaBoxes,
      entry.meta,
      handleMetaChange,
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
      onChange={handleChange}
      documentPanel={documentPanel}
      publish={publishActions}
      overlay={overlay}
      onRefreshBlockLoader={(blockId) =>
        orpc.entry.refreshBlockLoader.call({ id, blockId }).then((r) => r.data)
      }
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
