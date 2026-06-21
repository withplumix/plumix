import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import { hasCap } from "@/lib/caps.js";
import { findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";

import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import { Button } from "@plumix/admin-ui/button";
import { slugify } from "@plumix/core/slugify";

const M = {
  untitled: defineMessage({
    id: "editor.entry.create.untitled",
    message: "Untitled",
  }),
  // Noun-less pending indicator — replaces the "Creating new {singular}…"
  // substitution. Pre-redirect transient surface; the next view shows
  // the entry's own title or a per-type fallback via the lookup label
  // cascade.
  pendingGeneric: defineMessage({
    id: "editor.entry.create.pending.generic",
    message: "Creating…",
  }),
  failedTitle: defineMessage({
    id: "editor.entry.create.failedTitle",
    message: "Couldn't create the entry",
  }),
  failedBody: defineMessage({
    id: "editor.entry.create.failed",
    message: "Something went wrong while creating a draft. Try again.",
  }),
  retry: defineMessage({
    id: "editor.entry.create.retry",
    message: "Try again",
  }),
} satisfies Record<string, MessageDescriptor>;

export const Route = createFileRoute("/_editor/entries/$slug/create")({
  beforeLoad: ({ context, params }): { entryType: EntryTypeManifestEntry } => {
    const entryType = findEntryTypeBySlug(params.slug);
    if (!entryType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw notFound();
    }
    const capabilityType = entryType.capabilityType ?? entryType.name;
    if (!hasCap(context.user.capabilities, `entry:${capabilityType}:create`)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error
      throw notFound();
    }
    return { entryType };
  },
  component: CreateEntryRoute,
});

function CreateEntryRoute(): ReactNode {
  const { entryType } = Route.useRouteContext();
  const renderLabel = useLabel();
  const navigate = useNavigate();
  // The route mounts once per visit; create the draft, redirect, done.
  // The redirect lands in edit.tsx which then handles autosave.
  const started = useRef(false);

  const create = useMutation({
    mutationFn: () =>
      orpc.entry.create.call({
        type: entryType.name,
        // Persisted once at create — locale switches don't rewrite stored data.
        title: renderLabel(M.untitled),
        // Random suffix: two creates in the same millisecond (parallel
        // tabs, double-click) would otherwise mint the same slug and
        // 409 on the unique constraint.
        slug: slugify(
          `untitled-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        ),
        status: "draft",
      }),
    onSuccess: (entry) => {
      void navigate({
        to: "/entries/$slug/$id/edit",
        params: { slug: entryType.adminSlug, id: entry.id },
        replace: true,
      });
    },
  });

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create.mutate();
  }, [create]);

  if (create.isError) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <ErrorPlaceholder
          testId="create-entry-error"
          title={renderLabel(M.failedTitle)}
          description={renderLabel(M.failedBody)}
        />
        <Button
          variant="outline"
          data-testid="create-entry-retry"
          onClick={() => create.mutate()}
        >
          {renderLabel(M.retry)}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="text-muted-foreground flex flex-1 items-center justify-center text-sm"
      data-testid="create-entry-pending"
    >
      {renderLabel(M.pendingGeneric)}
    </div>
  );
}
