import type { PostEditorValues } from "@/components/editor/entry-editor-form.js";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { PostEditorForm } from "@/components/editor/entry-editor-form.js";
import { hasCap } from "@/lib/caps.js";
import { ENTRIES_LIST_DEFAULT_SEARCH } from "@/lib/entries.js";
import { entryMetaBoxesForType, findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";

import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import type { EntryStatus } from "@plumix/core/schema";

// Statuses the new-post dropdown should expose. `trash` is omitted — you
// don't create a post straight into the trash bin; the list view has a
// dedicated Trash filter for that workflow.
const NEW_POST_STATUSES: readonly EntryStatus[] = [
  "draft",
  "published",
  "scheduled",
];

export const Route = createFileRoute("/_editor/entries/$slug/new")({
  beforeLoad: ({ context, params }): { entryType: EntryTypeManifestEntry } => {
    const entryType = findEntryTypeBySlug(params.slug);
    if (!entryType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // Only callers with the create capability see this screen. `edit_own`
    // alone isn't enough — that permission is about editing your own
    // existing entries, not spawning new ones.
    const capability = `entry:${entryType.capabilityType ?? entryType.name}:create`;
    if (!hasCap(context.user.capabilities, capability)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw redirect({
        to: "/entries/$slug",
        params: { slug: params.slug },
        search: ENTRIES_LIST_DEFAULT_SEARCH,
      });
    }
    return { entryType };
  },
  component: NewPostRoute,
});

function NewPostRoute(): ReactNode {
  const { user, entryType } = Route.useRouteContext();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const createPost = useMutation({
    mutationFn: (input: PostEditorValues) =>
      orpc.entry.create.call({
        type: entryType.name,
        title: input.title,
        slug: input.slug,
        content: input.content,
        excerpt: input.excerpt.length > 0 ? input.excerpt : null,
        status: input.status,
        meta: input.meta,
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async (created) => {
      await navigate({
        to: "/entries/$slug/$id",
        params: { slug: params.slug, id: created.id },
      });
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Couldn't save.");
    },
  });

  const initialValues: PostEditorValues = {
    title: "",
    slug: "",
    content: null,
    excerpt: "",
    status: "draft",
    meta: {},
  };

  // Meta boxes registered for this post type, filtered by the user's
  // capabilities. Memo keyed on `user.capabilities` avoids refiltering
  // every render while keeping the helper out of the component body.
  const metaBoxes = useMemo(
    () => entryMetaBoxesForType(entryType.name, user.capabilities),
    [entryType.name, user.capabilities],
  );

  const singularLower = (
    entryType.labels?.singular ?? entryType.label
  ).toLowerCase();

  return (
    <PostEditorForm
      initialValues={initialValues}
      slugLocked={false}
      availableStatuses={NEW_POST_STATUSES}
      supports={entryType.supports}
      metaBoxes={metaBoxes}
      headline={`New ${singularLower}`}
      submitLabel="Create"
      // Stay "busy" through `isSuccess` too — TanStack Query flips
      // `isPending` to false BEFORE `onSuccess` calls navigate(), which
      // would otherwise let the dirty-warn blocker prompt on the
      // successful-save navigation. The component unmounts when the
      // new route mounts, at which point the flag no longer matters.
      isSubmitting={createPost.isPending || createPost.isSuccess}
      serverError={createPost.isPending ? null : serverError}
      onSubmit={(values) => {
        createPost.mutate(values);
      }}
      onCancel={() => {
        void navigate({
          to: "/entries/$slug",
          params: { slug: params.slug },
          search: ENTRIES_LIST_DEFAULT_SEARCH,
        });
      }}
    />
  );
}
