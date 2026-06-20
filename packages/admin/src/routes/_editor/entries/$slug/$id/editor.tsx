import type { ReactNode } from "react";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import { orpc } from "@/lib/orpc.js";
import { Trans } from "@lingui/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import * as v from "valibot";

import { PlumixEditor } from "@plumix/admin-editor";
import { isEntryContent } from "@plumix/blocks";
import { idPathParam } from "@plumix/core/validation";

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
    />
  );
}
