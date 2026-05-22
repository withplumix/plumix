import type { AutosaveStatus } from "@/editor/AutosaveStatus.js";
import type { Config, Data } from "@puckeditor/core";
import type { ReactElement, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PlainFormLayout } from "@/components/editor/plain-form-layout.js";
import { AutosaveStatusContext } from "@/editor/AutosaveStatus.js";
import { blockSpecsToPuckComponents } from "@/editor/block-adapter.js";
import { createDebouncer } from "@/editor/debounce.js";
import { PlumixEditorLayout } from "@/editor/EditorLayout.js";
import { seedPuckData } from "@/editor/entry-content.js";
import { readDraft, writeDraft } from "@/editor/local-draft.js";
import { puckDataToBlockTree } from "@/editor/puck-to-block-tree.js";
import { registerCoreBlocks } from "@/editor/register-core-blocks.js";
import { resolveEditorMode } from "@/editor/resolve-editor-mode.js";
import { PreviewBanner } from "@/editor/revisions/PreviewBanner.js";
import { useRevisionsTrigger } from "@/editor/revisions/use-revisions-trigger.js";
import { entryMetaBoxesForType, findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { getRegisteredBlocks } from "@/lib/plugin-registry.js";
import { formatRelativeTime } from "@/lib/relative-time.js";
import { ORPCError } from "@orpc/client";
import { Puck } from "@puckeditor/core";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import * as v from "valibot";

import type { ThemeTokens } from "@plumix/blocks";
import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import { coreMarkExtensions, createBlockRegistry } from "@plumix/blocks";
import { idPathParam } from "@plumix/core/validation";

import "@puckeditor/core/puck.css";

const EMPTY_DATA: Data = { content: [], root: {} };

// 1 s batches typing bursts; the dedup snapshot in the autosave closure
// is what actually prevents identical revisions. WordPress's 60 s
// equivalent is overkill here because we round-trip a workers DB on
// every save and revisions are cheap.
const AUTOSAVE_DEBOUNCE_MS = 1000;

// Keep in sync with the identical helper in _editor/entries/$slug/$id/edit.tsx.
function isStaleConflictError(err: unknown): boolean {
  if (!(err instanceof ORPCError)) return false;
  if (err.code !== "CONFLICT") return false;
  const data = err.data as { reason?: unknown };
  return data.reason === "stale_expected_updated_at";
}

const sampleTokens: ThemeTokens = {
  colors: {
    background: { value: "#ffffff", label: "Background" },
    surface: { value: "#f4f4f5", label: "Surface" },
    brand: { value: "#0070f3", label: "Brand" },
    ink: { value: "#111111", label: "Ink" },
  },
  spacing: {
    none: { value: "0", label: "None" },
    sm: { value: "0.5rem", label: "Small" },
    md: { value: "1rem", label: "Medium" },
    lg: { value: "2rem", label: "Large" },
  },
  typography: {
    sm: { value: "0.875rem", label: "Small" },
    md: { value: "1rem", label: "Medium" },
    lg: { value: "1.25rem", label: "Large" },
    xl: { value: "1.5rem", label: "Extra large" },
  },
};

registerCoreBlocks();
const runtimeBlocks = getRegisteredBlocks();
const registry = createBlockRegistry(runtimeBlocks);
const config: Config = {
  components: blockSpecsToPuckComponents(runtimeBlocks, {
    // Puck types `extensions` as a mutable array; spread the readonly
    // plumix list to satisfy the assignment without weakening the
    // export.
    richtextExtensions: [...coreMarkExtensions],
  }),
};

// `?revision=<id>` switches the route into preview mode: the editor
// loads the chosen revision's content read-only and replaces the
// header with a `<PreviewBanner>` that offers "Back to live" + restore.
// Schema is loose so any other admin search params (e.g. future tab
// state) pass through untouched.
const editSearchSchema = v.looseObject({
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
  validateSearch: (search) => v.parse(editSearchSchema, search),
  // Prefetch with `preview: true` to match what `PuckSpikeRouteInner`
  // consumes — slice D switched the route's suspense to the preview
  // overlay so the editor seeds from any existing autosave. Mismatched
  // keys here would force a second roundtrip on mount.
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.entry.get.queryOptions({
        input: { id: params.id, preview: true },
      }),
    ),
  pendingComponent: PendingScreen,
  errorComponent: ErrorScreen,
  component: PuckSpikeRoute,
});

function PendingScreen(): ReactNode {
  return (
    <div
      className="text-muted-foreground p-6 text-sm"
      data-testid="plumix-editor-pending"
    >
      Loading entry…
    </div>
  );
}

function ErrorScreen(): ReactNode {
  return (
    <div
      className="text-muted-foreground p-6 text-sm"
      data-testid="plumix-editor-error"
    >
      Couldn't load this entry.
    </div>
  );
}

function PuckSpikeRoute(): ReactNode {
  const { slug, id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const { revision: previewRevisionId } = Route.useSearch();
  const draftKey = `plumix.v2.draft.${slug}.${id}`;
  const entryType = findEntryTypeBySlug(slug);
  const supportsRevisions = entryType?.supports?.includes("revisions") ?? false;
  // Non-editor entry types (structured records like authors, products,
  // events) get the plain-form Cards layout instead of the Puck canvas.
  // The dispatcher reads from the manifest's `supports` list.
  const supportsEditor = entryType?.supports
    ? entryType.supports.includes("editor")
    : true;
  const backHref = `/entries/${slug}`;
  if (!supportsEditor && entryType) {
    return (
      <PlainFormRouteInner
        key={draftKey}
        entryType={entryType}
        id={id}
        supportsRevisions={supportsRevisions}
        capabilities={user.capabilities}
      />
    );
  }
  // `key` flips on the preview revision so the editor remounts cleanly
  // when entering / leaving preview — the `useState` initialisers that
  // seed Puck data run again instead of stale-rendering live content.
  if (previewRevisionId !== undefined) {
    return (
      <PuckPreviewRouteInner
        key={`preview-${String(previewRevisionId)}`}
        id={id}
        revisionId={previewRevisionId}
        capabilities={user.capabilities}
        backHref={backHref}
      />
    );
  }
  return (
    <PuckSpikeRouteInner
      key={draftKey}
      draftKey={draftKey}
      id={id}
      entryType={entryType}
      supportsRevisions={supportsRevisions}
      capabilities={user.capabilities}
      userId={user.id}
      backHref={backHref}
    />
  );
}

interface PuckSpikeRouteInnerProps {
  readonly draftKey: string;
  readonly id: number;
  readonly entryType: EntryTypeManifestEntry | undefined;
  readonly supportsRevisions: boolean;
  readonly capabilities: readonly string[];
  readonly userId: number;
  readonly backHref: string;
}

function PuckSpikeRouteInner({
  draftKey,
  id,
  entryType,
  supportsRevisions,
  capabilities,
  userId,
  backHref,
}: PuckSpikeRouteInnerProps): ReactNode {
  const entryTypeName = entryType?.name;
  // `preview: true` overlays any existing autosave onto the live row
  // and decorates the response with `_preview`. For types/users
  // without autosave the overlay is a no-op and `_preview.source`
  // reads `'live'`. Safe for the editor route because anyone here
  // has the edit caps the preview gate requires.
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id, preview: true } }),
  );
  // Initial-only: Puck owns the live editor state via its internal store.
  // Re-seeding `<Puck data>` mid-keystroke unmounts Tiptap and steals
  // focus — useState's init function runs once per component instance
  // and is immune to entry refetches.
  const [initialData] = useState<Data>(() =>
    seedPuckData(entry.content, readDraft(draftKey) ?? EMPTY_DATA),
  );
  const [title, setTitle] = useState<string>(entry.title);
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  // Optimistic-concurrency token; trailing-response wins on overlap.
  const liveUpdatedAtRef = useRef<Date>(entry.updatedAt);
  const queryClient = useQueryClient();
  const titleRef = useRef(title);
  const dataRef = useRef<Data>(initialData);
  useEffect(() => {
    titleRef.current = title;
  });
  // Seed dedup snapshots from the *server* entry, never from the local
  // `data` — `data` may have been hydrated from a stale localStorage
  // draft, and matching against that would skip the first autosave and
  // silently strand the draft on the client.
  const lastSavedTitleRef = useRef<string>(entry.title);
  const lastSavedContentRef = useRef<string>(
    JSON.stringify(
      puckDataToBlockTree({
        content: seedPuckData(entry.content, EMPTY_DATA).content,
      }),
    ),
  );
  /* eslint-disable react-hooks/refs -- callback fires post-keystroke, not during render */
  const debouncer = useMemo(
    () =>
      createDebouncer(async () => {
        writeDraft(draftKey, dataRef.current);
        // entry.update's `title` schema is `trimmedText(300)` with a
        // minLength of 1 — an empty title rejects with INVALID_INPUT.
        // Omit the title from the payload when blank so a user mid-
        // typing an empty input doesn't break their autosave loop.
        const trimmedTitle = titleRef.current.trim();
        const blocks = puckDataToBlockTree({
          content: dataRef.current.content,
        });
        const serializedBlocks = JSON.stringify(blocks);
        const titleChanged =
          trimmedTitle.length > 0 && trimmedTitle !== lastSavedTitleRef.current;
        const contentChanged = serializedBlocks !== lastSavedContentRef.current;
        if (!titleChanged && !contentChanged) {
          // Nothing actually changed since the last successful save.
          // Skip the round-trip so we don't burn revision slots or
          // generate identical rows. The pill stays on "saved".
          setStatus("saved");
          return;
        }
        try {
          const updated = await orpc.entry.update.call({
            id,
            ...(titleChanged ? { title: trimmedTitle } : {}),
            ...(contentChanged
              ? { content: { version: "plumix.v2", blocks } }
              : {}),
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          // Only stamp the live concurrency token when the write
          // actually landed on the live row. Slice C routes
          // autosave-supporting types to a per-user autosave row;
          // the response's `updatedAt` is that autosave's timestamp,
          // not live's. Poisoning the ref with it would 409 the next
          // publish (the canonical bug this guard prevents).
          if (updated.type === entry.type) {
            liveUpdatedAtRef.current = updated.updatedAt;
          }
          if (titleChanged) lastSavedTitleRef.current = trimmedTitle;
          if (contentChanged) lastSavedContentRef.current = serializedBlocks;
          setStatus("saved");
        } catch (err) {
          setStatus("error");
          if (isStaleConflictError(err)) {
            // Puck state is seeded once and ignores this refetch — in-progress
            // edits aren't overwritten.
            try {
              const fresh = await queryClient.fetchQuery({
                ...orpc.entry.get.queryOptions({ input: { id } }),
                staleTime: 0,
              });
              liveUpdatedAtRef.current = fresh.updatedAt;
            } catch {
              // Best-effort: pill already says "error"; next keystroke retries.
            }
          }
        }
      }, AUTOSAVE_DEBOUNCE_MS),
    // `entry.type` is stable for a given row; including it satisfies
    // the exhaustive-deps rule without adding meaningful churn.
    [draftKey, id, queryClient, entry.type],
  );
  /* eslint-enable react-hooks/refs */
  useEffect(() => () => debouncer.flush(), [debouncer]);
  const handleChange = useCallback(
    (next: Data): void => {
      dataRef.current = next;
      setStatus("saving");
      debouncer.call();
    },
    [debouncer],
  );
  const handleTitleChange = useCallback(
    (next: string): void => {
      setTitle(next);
      setStatus("saving");
      debouncer.call();
    },
    [debouncer],
  );
  // Publish is a one-way state-machine transition server-side, not an
  // idempotent re-stamp — the button is disabled once status === "published".
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
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
        }),
        ...(entryTypeName
          ? [
              queryClient.invalidateQueries({
                queryKey: orpc.entry.list.key({
                  input: { type: entryTypeName },
                }),
              }),
            ]
          : []),
      ]),
  });
  const isPublished = entry.status === "published";
  const handlePublish = useCallback(() => publish.mutate(), [publish]);
  const capabilitySet = useMemo(() => new Set(capabilities), [capabilities]);
  const navigate = Route.useNavigate();
  const handlePreview = useCallback(
    (revisionId: number): void => {
      void navigate({ search: (prev) => ({ ...prev, revision: revisionId }) });
    },
    [navigate],
  );
  const revisionsTrigger = useRevisionsTrigger({
    entryId: id,
    enabled: supportsRevisions,
    onPreview: handlePreview,
  });

  // edit-with-draft mode: published row + type opts into autosave +
  // viewer can edit. The debouncer already routes writes to the
  // autosave row via slice C's `saveAs` defaulting — only the
  // header surface + banner + publish/discard wiring differ from
  // the live flow.
  const editorMode = resolveEditorMode({
    entryType,
    currentStatus: entry.status,
    isAuthor: entry.authorId === userId,
    capabilities: capabilitySet,
  });
  const isEditWithDraft = editorMode === "edit-with-draft";
  const hasPendingDraft = entry._preview?.source === "autosave";

  const publishDraft = useMutation({
    mutationFn: () =>
      orpc.entry.publish.call({
        id,
        expectedLiveUpdatedAt: liveUpdatedAtRef.current,
      }),
    onSuccess: async (updated) => {
      liveUpdatedAtRef.current = updated.updatedAt;
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({
            input: { id, preview: true },
          }).queryKey,
        }),
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
      ]);
    },
  });
  const discardDraft = useMutation({
    mutationFn: () => orpc.entry.discardDraft.call({ id }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({
            input: { id, preview: true },
          }).queryKey,
        }),
        // Autosaves surface in the revisions list (slice 3 of #289
        // shows them under the Autosaves tab once #292 lands).
        // Invalidating here keeps the sheet in sync after a discard.
        queryClient.invalidateQueries({
          queryKey: ["entry.revisions", id],
        }),
      ]);
    },
  });
  const handlePublishDraft = useCallback(
    () => publishDraft.mutate(),
    [publishDraft],
  );
  const handleDiscardDraft = useCallback(
    () => discardDraft.mutate(),
    [discardDraft],
  );
  const handleSaveDraft = useCallback(() => {
    // Force-flush any pending debounced write so "Save Draft" is
    // immediate. The debouncer's callback writes the autosave row via
    // `entry.update` (server defaults to `saveAs: 'draft'`).
    debouncer.flush();
  }, [debouncer]);

  const draftModeProp = useMemo(
    () =>
      isEditWithDraft
        ? {
            hasPendingDraft,
            onSaveDraft: handleSaveDraft,
            onPublishDraft: handlePublishDraft,
            onDiscardDraft: handleDiscardDraft,
            isSaving: status === "saving",
            isPublishing: publishDraft.isPending,
            isDiscarding: discardDraft.isPending,
          }
        : undefined,
    [
      isEditWithDraft,
      hasPendingDraft,
      handleSaveDraft,
      handlePublishDraft,
      handleDiscardDraft,
      status,
      publishDraft.isPending,
      discardDraft.isPending,
    ],
  );
  const Layout = useCallback(
    (): ReactElement => (
      <PlumixEditorLayout
        registry={registry}
        capabilities={capabilitySet}
        tokens={sampleTokens}
        title={title}
        onTitleChange={handleTitleChange}
        backHref={backHref}
        onPublish={handlePublish}
        isPublishing={publish.isPending}
        isPublished={isPublished}
        revisionsTrigger={revisionsTrigger}
        draftMode={draftModeProp}
      />
    ),
    [
      title,
      handleTitleChange,
      backHref,
      handlePublish,
      publish.isPending,
      isPublished,
      capabilitySet,
      revisionsTrigger,
      draftModeProp,
    ],
  );

  return (
    <AutosaveStatusContext.Provider value={status}>
      <Puck
        config={config}
        data={initialData}
        onChange={handleChange}
        iframe={{ enabled: false }}
        overrides={{ puck: Layout }}
      />
    </AutosaveStatusContext.Provider>
  );
}

// All five Puck Permissions flags off — drops drag handles, the +
// insert affordance, inline-edit, the duplicate menu item, and the
// delete action. Combined with the disabled title input + hidden
// publish button in PlumixEditorLayout this leaves no write path
// for the user while previewing a revision.
const READ_ONLY_PERMISSIONS = {
  drag: false,
  duplicate: false,
  delete: false,
  edit: false,
  insert: false,
} as const;

interface PuckPreviewRouteInnerProps {
  readonly id: number;
  readonly revisionId: number;
  readonly capabilities: readonly string[];
  readonly backHref: string;
}

function PuckPreviewRouteInner({
  id,
  revisionId,
  capabilities,
  backHref,
}: PuckPreviewRouteInnerProps): ReactNode {
  const { data: liveEntry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id } }),
  );
  const { data: revision } = useSuspenseQuery(
    orpc.entry.revisions.get.queryOptions({ input: { revisionId } }),
  );
  const queryClient = useQueryClient();
  const navigate = Route.useNavigate();
  const liveUpdatedAtRef = useRef<Date>(liveEntry.updatedAt);
  // Read-once seed: Puck owns state internally after mount, and the
  // outer `key` change on the search-param transition is what triggers
  // a fresh init when entering / leaving preview.
  const [initialData] = useState<Data>(() =>
    seedPuckData(revision.content, EMPTY_DATA),
  );
  const capabilitySet = useMemo(() => new Set(capabilities), [capabilities]);

  const handleBackToLive = useCallback((): void => {
    void navigate({ search: (prev) => ({ ...prev, revision: undefined }) });
  }, [navigate]);

  const restore = useMutation({
    mutationFn: async () => {
      const restored = await orpc.entry.revisions.restore.call({
        revisionId,
        expectedLiveUpdatedAt: liveUpdatedAtRef.current,
      });
      liveUpdatedAtRef.current = restored.updatedAt;
      return restored;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
      });
      handleBackToLive();
    },
  });

  const handleRestore = useCallback(() => restore.mutate(), [restore]);
  // Surface the most useful detail for the user. CONFLICT (stale
  // `expectedLiveUpdatedAt`) is the common case when another tab
  // edited the live entry after this preview loaded.
  const restoreError =
    restore.error instanceof ORPCError && restore.error.code === "CONFLICT"
      ? "Another editor changed this entry. Reload and try again."
      : restore.error instanceof Error
        ? restore.error.message
        : null;
  const revisionAuthor =
    revision.authorName ?? revision.authorEmail ?? `#${String(revisionId)}`;
  const Layout = useCallback(
    (): ReactElement => (
      <PlumixEditorLayout
        registry={registry}
        capabilities={capabilitySet}
        tokens={sampleTokens}
        title={revision.title}
        onTitleChange={() => undefined}
        backHref={backHref}
        onPublish={() => undefined}
        isPublishing={false}
        isPublished={false}
        previewBanner={
          <PreviewBanner
            revisionUpdatedAt={revision.updatedAt}
            revisionAuthor={revisionAuthor}
            relativeTime={formatRelativeTime}
            onBackToLive={handleBackToLive}
            onRestore={handleRestore}
            isRestoring={restore.isPending}
            restoreError={restoreError}
          />
        }
      />
    ),
    [
      revision.title,
      revision.updatedAt,
      revisionAuthor,
      backHref,
      capabilitySet,
      handleBackToLive,
      handleRestore,
      restore.isPending,
      restoreError,
    ],
  );

  return (
    <Puck
      config={config}
      data={initialData}
      iframe={{ enabled: false }}
      permissions={READ_ONLY_PERMISSIONS}
      overrides={{ puck: Layout }}
    />
  );
}

interface PlainFormRouteInnerProps {
  readonly entryType: EntryTypeManifestEntry;
  readonly id: number;
  readonly supportsRevisions: boolean;
  readonly capabilities: readonly string[];
}

function PlainFormRouteInner({
  entryType,
  id,
  supportsRevisions,
  capabilities,
}: PlainFormRouteInnerProps): ReactNode {
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id } }),
  );
  const queryClient = useQueryClient();
  const liveUpdatedAtRef = useRef<Date>(entry.updatedAt);
  const [serverError, setServerError] = useState<string | null>(null);

  const metaBoxes = entryMetaBoxesForType(entryType.name, capabilities);

  const updateMutation = useMutation({
    mutationFn: (values: {
      title: string;
      status: string;
      meta: Record<string, unknown>;
    }) =>
      orpc.entry.update.call({
        id,
        title: values.title,
        status: values.status as never,
        meta: values.meta,
        expectedLiveUpdatedAt: liveUpdatedAtRef.current,
      }),
    onSuccess: async (updated) => {
      setServerError(null);
      liveUpdatedAtRef.current = updated.updatedAt;
      await queryClient.invalidateQueries({
        queryKey: orpc.entry.get.queryOptions({ input: { id } }).queryKey,
      });
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Couldn't save.");
    },
  });

  const navigate = Route.useNavigate();
  const handlePreview = useCallback(
    (revisionId: number): void => {
      void navigate({ search: (prev) => ({ ...prev, revision: revisionId }) });
    },
    [navigate],
  );
  const revisionsTrigger = useRevisionsTrigger({
    entryId: id,
    enabled: supportsRevisions,
    onPreview: handlePreview,
  });

  const initialValues = {
    title: entry.title,
    slug: entry.slug,
    content: entry.content,
    excerpt: entry.excerpt ?? "",
    status: entry.status,
    meta: entry.meta,
    terms: {},
    parentId: entry.parentId,
  };

  return (
    <PlainFormLayout
      key={String(id)}
      initialValues={initialValues}
      metaBoxes={metaBoxes}
      headline={`Edit ${(entryType.labels?.singular ?? entryType.label).toLowerCase()}`}
      isSubmitting={updateMutation.isPending}
      serverError={updateMutation.isPending ? null : serverError}
      autosaveMs={500}
      revisionsTrigger={revisionsTrigger}
      onSubmit={(values) =>
        updateMutation.mutate({
          title: values.title,
          status: values.status,
          meta: values.meta,
        })
      }
    />
  );
}
