import type { ThemeTokens } from "@plumix/blocks";
import type { Config, Data } from "@puckeditor/core";
import type { ReactElement, ReactNode } from "react";
import {
  coreBlocksV2,
  coreMarkExtensions,
  createBlockRegistry,
} from "@plumix/blocks";
import { ORPCError } from "@orpc/client";
import { Puck } from "@puckeditor/core";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as v from "valibot";

import type { AutosaveStatus } from "@/editor/AutosaveStatus.js";

import { AutosaveStatusContext } from "@/editor/AutosaveStatus.js";
import { blockSpecsToPuckComponents } from "@/editor/block-adapter.js";
import { createDebouncer } from "@/editor/debounce.js";
import { PlumixEditorLayout } from "@/editor/EditorLayout.js";
import { readDraft, writeDraft } from "@/editor/local-draft.js";
import { puckDataToBlockTree } from "@/editor/puck-to-block-tree.js";
import { seedPuckData } from "@/editor/entry-content.js";
import { useRevisionsTrigger } from "@/editor/revisions/use-revisions-trigger.js";
import { findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { idPathParam } from "@plumix/core/validation";

import "@puckeditor/core/puck.css";

const initialData: Data = { content: [], root: {} };

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

const registry = createBlockRegistry(coreBlocksV2);
const config: Config = {
  components: blockSpecsToPuckComponents(coreBlocksV2, {
    // Puck types `extensions` as a mutable array; spread the readonly
    // plumix list to satisfy the assignment without weakening the
    // export.
    richtextExtensions: [...coreMarkExtensions],
  }),
};

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
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.entry.get.queryOptions({ input: { id: params.id } }),
    ),
  pendingComponent: PendingScreen,
  errorComponent: ErrorScreen,
  component: PuckSpikeRoute,
});

function PendingScreen(): ReactNode {
  return (
    <div
      className="p-6 text-sm text-muted-foreground"
      data-testid="plumix-editor-pending"
    >
      Loading entry…
    </div>
  );
}

function ErrorScreen(): ReactNode {
  return (
    <div
      className="p-6 text-sm text-muted-foreground"
      data-testid="plumix-editor-error"
    >
      Couldn't load this entry.
    </div>
  );
}

function PuckSpikeRoute(): ReactNode {
  const { slug, id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const draftKey = `plumix.v2.draft.${slug}.${id}`;
  const entryType = findEntryTypeBySlug(slug);
  const supportsRevisions = entryType?.supports?.includes("revisions") ?? false;
  return (
    <PuckSpikeRouteInner
      key={draftKey}
      draftKey={draftKey}
      id={id}
      entryTypeName={entryType?.name}
      supportsRevisions={supportsRevisions}
      capabilities={user.capabilities}
    />
  );
}

interface PuckSpikeRouteInnerProps {
  readonly draftKey: string;
  readonly id: number;
  readonly entryTypeName: string | undefined;
  readonly supportsRevisions: boolean;
  readonly capabilities: readonly string[];
}

function PuckSpikeRouteInner({
  draftKey,
  id,
  entryTypeName,
  supportsRevisions,
  capabilities,
}: PuckSpikeRouteInnerProps): ReactNode {
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id } }),
  );
  const [data, setData] = useState<Data>(() =>
    seedPuckData(entry.content, readDraft(draftKey) ?? initialData),
  );
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  // Optimistic-concurrency token; trailing-response wins on overlap.
  const liveUpdatedAtRef = useRef<Date>(entry.updatedAt);
  const queryClient = useQueryClient();
  /* eslint-disable react-hooks/refs -- callback fires post-keystroke, not during render */
  const debouncer = useMemo(
    () =>
      createDebouncer(async (next: Data) => {
        writeDraft(draftKey, next);
        try {
          const updated = await orpc.entry.update.call({
            id,
            content: {
              version: "plumix.v2",
              blocks: puckDataToBlockTree({ content: next.content }),
            },
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          liveUpdatedAtRef.current = updated.updatedAt;
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
      }, 300),
    [draftKey, id, queryClient],
  );
  /* eslint-enable react-hooks/refs */
  useEffect(() => () => debouncer.flush(), [debouncer]);
  const handleChange = useCallback(
    (next: Data): void => {
      setData(next);
      setStatus("saving");
      debouncer.call(next);
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
  const capabilitySet = useMemo(
    () => new Set(capabilities),
    [capabilities],
  );
  const revisionsTrigger = useRevisionsTrigger({
    entryId: id,
    enabled: supportsRevisions,
    liveUpdatedAtRef,
  });
  const Layout = useCallback(
    (): ReactElement => (
      <PlumixEditorLayout
        registry={registry}
        capabilities={capabilitySet}
        tokens={sampleTokens}
        onPublish={handlePublish}
        isPublishing={publish.isPending}
        isPublished={isPublished}
        revisionsTrigger={revisionsTrigger}
      />
    ),
    [
      handlePublish,
      publish.isPending,
      isPublished,
      capabilitySet,
      revisionsTrigger,
    ],
  );

  return (
    <AutosaveStatusContext.Provider value={status}>
      <Puck
        config={config}
        data={data}
        onChange={handleChange}
        iframe={{ enabled: false }}
        overrides={{ puck: Layout }}
      />
    </AutosaveStatusContext.Provider>
  );
}

