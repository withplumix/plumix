import type { ThemeTokens } from "@plumix/blocks";
import type { Config, Data } from "@puckeditor/core";
import type { ReactElement, ReactNode } from "react";
import { coreBlocksV2, createBlockRegistry } from "@plumix/blocks";
import { Puck } from "@puckeditor/core";
import { useMutation, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as v from "valibot";

import type { AutosaveStatus } from "@/editor/v2/AutosaveStatus.js";

import { AutosaveStatusContext } from "@/editor/v2/AutosaveStatus.js";
import { blockSpecsToPuckComponents } from "@/editor/v2/block-adapter.js";
import { createDebouncer } from "@/editor/v2/debounce.js";
import { PlumixEditorLayout } from "@/editor/v2/EditorLayout.js";
import { readDraft, writeDraft } from "@/editor/v2/local-draft.js";
import { puckDataToBlockTree } from "@/editor/v2/puck-to-block-tree.js";
import { seedPuckData } from "@/editor/v2/v2-entry-content.js";
import { findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { idPathParam } from "@plumix/core/validation";

import "@puckeditor/core/puck.css";

const initialData: Data = { content: [], root: {} };

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
  components: blockSpecsToPuckComponents(coreBlocksV2),
};

export const Route = createFileRoute("/_editor/v2/entries/$slug/$id/edit")({
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
  const draftKey = `plumix.v2.draft.${slug}.${id}`;
  const entryTypeName = findEntryTypeBySlug(slug)?.name;
  return (
    <PuckSpikeRouteInner
      key={draftKey}
      draftKey={draftKey}
      id={id}
      entryTypeName={entryTypeName}
    />
  );
}

interface PuckSpikeRouteInnerProps {
  readonly draftKey: string;
  readonly id: number;
  readonly entryTypeName: string | undefined;
}

function PuckSpikeRouteInner({
  draftKey,
  id,
  entryTypeName,
}: PuckSpikeRouteInnerProps): ReactNode {
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id } }),
  );
  const [data, setData] = useState<Data>(() =>
    seedPuckData(entry.content, readDraft(draftKey) ?? initialData),
  );
  const [status, setStatus] = useState<AutosaveStatus>("saved");
  const debouncer = useMemo(
    () =>
      // Rejections are swallowed deliberately: error-state UX (retry, stuck
      // pill, conflict surface) is its own slice. Without the catch the
      // promise would surface as an unhandled rejection in CI smoke.
      createDebouncer(async (next: Data) => {
        writeDraft(draftKey, next);
        try {
          await orpc.entry.update.call({
            id,
            content: {
              version: "plumix.v2",
              blocks: puckDataToBlockTree({ content: next.content }),
            },
          });
          setStatus("saved");
        } catch {
          // intentionally empty — see comment above
        }
      }, 300),
    [draftKey, id],
  );
  useEffect(() => () => debouncer.flush(), [debouncer]);
  const handleChange = useCallback(
    (next: Data): void => {
      setData(next);
      setStatus("saving");
      debouncer.call(next);
    },
    [debouncer],
  );
  const queryClient = useQueryClient();
  // Publish is a one-way state-machine transition server-side, not an
  // idempotent re-stamp — the button is disabled once status === "published".
  // expectedLiveUpdatedAt is not pinned yet; the concurrency-token gap
  // (race between a concurrent publish and an in-flight content autosave)
  // is owned by the error-UX slice on the #391 line.
  const publish = useMutation({
    mutationFn: () => orpc.entry.update.call({ id, status: "published" }),
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
  const Layout = useCallback(
    (): ReactElement => (
      <PlumixEditorLayout
        registry={registry}
        tokens={sampleTokens}
        onPublish={handlePublish}
        isPublishing={publish.isPending}
        isPublished={isPublished}
      />
    ),
    [handlePublish, publish.isPending, isPublished],
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

