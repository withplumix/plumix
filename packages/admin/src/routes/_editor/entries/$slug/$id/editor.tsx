import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DocumentSettingsPanel } from "@/components/editor/document-settings.js";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import { AUTOSAVE_DEBOUNCE_MS, freshLiveUpdatedAt } from "@/editor/autosave.js";
import { createDebouncer } from "@/editor/debounce.js";
import { registerCoreBlocks } from "@/editor/register-core-blocks.js";
import { entryMetaBoxesForType, findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { getRegisteredBlocks } from "@/lib/plugin-registry.js";
import { Trans } from "@lingui/react";
import {
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import * as v from "valibot";

import type { EntryContent } from "@plumix/blocks";
import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import { PlumixEditor } from "@plumix/admin-editor";
import {
  createBlockRegistry,
  defineEntryContent,
  isEntryContent,
} from "@plumix/blocks";
import { idPathParam } from "@plumix/core/validation";

// Core + plugin blocks supply the inspector's input schemas. Built once at
// module load, mirroring the Puck route.
registerCoreBlocks();
const registry = createBlockRegistry(getRegisteredBlocks());

// Mint once and cache forever — each call writes a fresh preview token, and
// the URL it returns is the canvas iframe's target for the editor's lifetime.
const previewLinkQuery = (
  id: number,
): ReturnType<typeof orpc.entry.createPreviewLink.queryOptions> =>
  orpc.entry.createPreviewLink.queryOptions({
    input: { id },
    staleTime: Infinity,
  });

// The bespoke visual editor — opt-in (its own route; the Puck `/edit` route
// stays the default editor). The entry load and the preview mint both run in
// the loader so a failure (unreadable entry, no public url) surfaces through
// one ErrorScreen rather than a dead canvas.
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
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.ensureQueryData(
        orpc.entry.get.queryOptions({
          input: { id: params.id, preview: true },
        }),
      ),
      context.queryClient.ensureQueryData(previewLinkQuery(params.id)),
    ]),
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
  const { slug } = Route.useParams();
  const { user } = Route.useRouteContext();
  // Pass capabilities + entryType across a prop boundary so the React Compiler
  // treats them as stable inputs (member/derived reads inline read as
  // possibly-mutated, which forces the compiler to skip optimizing).
  return (
    <BespokeEditor
      capabilities={user.capabilities}
      entryType={findEntryTypeBySlug(slug)}
    />
  );
}

interface BespokeEditorProps {
  readonly capabilities: readonly string[];
  readonly entryType: EntryTypeManifestEntry | undefined;
}

// Persistence lives inline in the component (not a custom hook) so the React
// Compiler can optimize it — the same shape that compiles for the Puck route.
// Content + excerpt + meta ride one debounced autosave-row write; slug + parent
// ride a second debouncer that writes the live row (`saveAs: "live"`). Both
// share one optimistic-concurrency token, refreshed on a stale conflict.
function BespokeEditor({
  capabilities,
  entryType,
}: BespokeEditorProps): ReactNode {
  const { id } = Route.useParams();
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id, preview: true } }),
  );
  const { data: previewLink } = useSuspenseQuery(previewLinkQuery(id));
  const queryClient = useQueryClient();
  const entryTypeName = entryType?.name;
  const capabilitySet = useMemo(() => new Set(capabilities), [capabilities]);

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

  // `createPreviewLink` returns a site-relative url (`/blog/hello?preview=…`);
  // resolve it against the admin's own origin (the public site is same-origin)
  // and flip on `plumix.edit` so the public render boots the editor runtime.
  const target = new URL(previewLink.url, window.location.origin);
  target.searchParams.set("plumix.edit", "");

  return (
    <PlumixEditor
      previewUrl={target.toString()}
      origin={target.origin}
      defaultValue={isEntryContent(entry.content) ? entry.content : undefined}
      registry={registry}
      capabilities={capabilitySet}
      onChange={handleChange}
      documentPanel={documentPanel}
    />
  );
}
