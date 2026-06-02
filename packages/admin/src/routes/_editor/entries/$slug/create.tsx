import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { hasCap } from "@/lib/caps.js";
import { findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useMutation } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";

import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import { slugify } from "@plumix/core/slugify";

const M = {
  untitled: defineMessage({
    id: "editor.entry.create.untitled",
    message: "Untitled",
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
        slug: slugify(`untitled-${Date.now().toString(36)}`),
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

  return (
    <div
      className="text-muted-foreground flex flex-1 items-center justify-center text-sm"
      data-testid="create-entry-pending"
    >
      <Trans
        id="editor.entry.create.pending"
        message="Creating new {singular}…"
        values={{
          singular: entryType.labels?.singular ?? renderLabel(entryType.label),
        }}
      />
    </div>
  );
}
