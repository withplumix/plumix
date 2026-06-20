import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import {
  AUTOSAVE_DEBOUNCE_MS,
  isStaleConflictError,
} from "@/editor/autosave.js";
import { createDebouncer } from "@/editor/debounce.js";
import { registerCoreBlocks } from "@/editor/register-core-blocks.js";
import { orpc } from "@/lib/orpc.js";
import { getRegisteredBlocks } from "@/lib/plugin-registry.js";
import { Trans } from "@lingui/react";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import * as v from "valibot";

import type { EntryContent } from "@plumix/blocks";
import { PlumixEditor } from "@plumix/admin-editor";
import { createBlockRegistry, isEntryContent } from "@plumix/blocks";
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
  const { id } = Route.useParams();
  const { data: entry } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id, preview: true } }),
  );
  const { data: previewLink } = useSuspenseQuery(previewLinkQuery(id));
  const handleChange = useContentAutosave(id, entry);

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
      onChange={handleChange}
    />
  );
}

interface EntryRow {
  readonly type: string;
  readonly updatedAt: Date;
  readonly content: unknown;
}

// Debounced content autosave. The editor package emits the full content
// envelope on every tree change; this is the only place orpc lives (the
// package stays persistence-free). Mirrors the Puck route's content path:
// dedup against the last save, ride the optimistic-concurrency token, and
// refresh it on a stale conflict so the next save recovers.
function useContentAutosave(
  id: number,
  entry: EntryRow,
): (content: EntryContent) => void {
  const queryClient = useQueryClient();
  const liveUpdatedAtRef = useRef<Date>(entry.updatedAt);
  const lastSavedRef = useRef<string>(
    JSON.stringify(isEntryContent(entry.content) ? entry.content.blocks : []),
  );
  const pendingRef = useRef<EntryContent | null>(null);
  /* eslint-disable react-hooks/refs -- callback fires post-keystroke, not during render */
  const debouncer = useMemo(
    () =>
      createDebouncer(async () => {
        const content = pendingRef.current;
        if (!content) return;
        const serialized = JSON.stringify(content.blocks);
        if (serialized === lastSavedRef.current) return;
        try {
          const updated = await orpc.entry.update.call({
            id,
            // Spread to a fresh object literal — the `content` RPC field is a
            // `Record<string, unknown>`, which the named EntryContent interface
            // doesn't satisfy without an index signature.
            content: { ...content },
            expectedLiveUpdatedAt: liveUpdatedAtRef.current,
          });
          // Only stamp the live token when the write landed on the live row;
          // autosave-supporting types route to a per-user autosave row whose
          // updatedAt isn't the live anchor (poisoning it would 409 publish).
          if (updated.type === entry.type) {
            liveUpdatedAtRef.current = updated.updatedAt;
          }
          lastSavedRef.current = serialized;
        } catch (err) {
          if (!isStaleConflictError(err)) return;
          try {
            const fresh = await queryClient.fetchQuery({
              ...orpc.entry.get.queryOptions({ input: { id } }),
              staleTime: 0,
            });
            liveUpdatedAtRef.current = fresh.updatedAt;
          } catch {
            // Best-effort: the next edit retries with the stale token.
          }
        }
      }, AUTOSAVE_DEBOUNCE_MS),
    [id, entry.type, queryClient],
  );
  /* eslint-enable react-hooks/refs */
  useEffect(() => () => debouncer.flush(), [debouncer]);
  return useCallback(
    (content: EntryContent): void => {
      pendingRef.current = content;
      debouncer.call();
    },
    [debouncer],
  );
}
