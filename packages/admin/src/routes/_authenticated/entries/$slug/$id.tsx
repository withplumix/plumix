import type { PostEditorValues } from "@/components/editor/entry-editor-form.js";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  POST_EDITOR_STATUSES,
  PostEditorForm,
} from "@/components/editor/entry-editor-form.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { hasCap } from "@/lib/caps.js";
import { findEntryTypeBySlug, entryMetaBoxesForType } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import * as v from "valibot";

import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import type { Entry } from "@plumix/core/schema";
import { idPathParam } from "@plumix/core/validation";

import { ENTRIES_LIST_DEFAULT_SEARCH } from "./-constants.js";

export const Route = createFileRoute("/_authenticated/entries/$slug/$id")({
  // Reject invalid ids as a router 404 before `beforeLoad` / `loader`
  // fire — no RPC, no stale-id flicker through the cache.
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
  beforeLoad: ({ params }): { entryType: EntryTypeManifestEntry } => {
    const entryType = findEntryTypeBySlug(params.slug);
    if (!entryType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { entryType };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.entry.get.queryOptions({ input: { id: params.id } }),
    ),
  // Pending/error screens are per-slug so copy reflects the actual
  // type ("page", "product") instead of hardcoding "post".
  pendingComponent: EditPostPendingScreen,
  errorComponent: EditPostErrorScreen,
  component: EditPostRoute,
});

function postTypeSingular(slug: string): string {
  const entryType = findEntryTypeBySlug(slug);
  return (
    entryType?.labels?.singular ??
    entryType?.label ??
    "post"
  ).toLowerCase();
}

function EditPostPendingScreen(): ReactNode {
  const { slug } = Route.useParams();
  return <EditorSkeleton label={`Loading ${postTypeSingular(slug)}`} />;
}

function EditPostErrorScreen(): ReactNode {
  const { slug } = Route.useParams();
  return (
    <NotFoundPlaceholder
      message={`Couldn't load that ${postTypeSingular(slug)}. It may have been deleted.`}
    />
  );
}

function EditPostRoute(): ReactNode {
  const { user, entryType } = Route.useRouteContext();
  const { id: entryId, slug } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: post } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id: entryId } }),
  );

  const updatePost = useMutation({
    mutationFn: (input: PostEditorValues) =>
      orpc.entry.update.call({
        id: entryId,
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
    onSuccess: async () => {
      // List variants are scoped by `type` so sibling post types
      // don't needlessly refetch.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.entry.get.queryOptions({ input: { id: entryId } })
            .queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.entry.list.key({ input: { type: entryType.name } }),
        }),
      ]);
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Couldn't save.");
    },
  });

  const singularLower = (
    entryType.labels?.singular ?? entryType.label
  ).toLowerCase();

  const metaBoxes = useMemo(
    () => entryMetaBoxesForType(entryType.name, user.capabilities),
    [entryType.name, user.capabilities],
  );

  const capNamespace = entryType.capabilityType ?? entryType.name;
  const canEditAny = hasCap(user.capabilities, `${capNamespace}:edit_any`);
  const canEditOwn =
    post.authorId === user.id &&
    hasCap(user.capabilities, `${capNamespace}:edit_own`);
  if (!canEditAny && !canEditOwn) {
    return (
      <NotFoundPlaceholder
        message={`You don't have permission to edit this ${singularLower}.`}
      />
    );
  }

  const initialValues: PostEditorValues = toEditorValues(post);

  return (
    <div className="flex max-w-6xl flex-col gap-6">
      <div>
        <h1
          className="text-2xl font-semibold"
          data-testid="post-editor-edit-heading"
        >
          Edit {singularLower}
        </h1>
        <p className="text-muted-foreground text-sm">
          ID {post.id} · last updated{" "}
          {new Date(post.updatedAt).toLocaleString()}
        </p>
      </div>
      <PostEditorForm
        // Key on `updatedAt` so a successful update (which bumps the
        // server's updatedAt and triggers a refetch) remounts the form
        // with fresh initial values — clears isDirty and re-arms the
        // blocker cleanly. Switching entries (different id → different
        // updatedAt) resets state the same way.
        key={
          post.updatedAt instanceof Date
            ? post.updatedAt.toISOString()
            : String(post.updatedAt)
        }
        initialValues={initialValues}
        slugLocked
        availableStatuses={POST_EDITOR_STATUSES}
        metaBoxes={metaBoxes}
        submitLabel="Save"
        // For the edit path, the post-save remount (keyed on
        // `updatedAt`) resets the form's isDirty to false — so the
        // blocker naturally stops prompting once the mutation settles.
        // No need to carry `isSuccess` across, unlike the new-post
        // route which has a navigation to bridge.
        isSubmitting={updatePost.isPending}
        serverError={updatePost.isPending ? null : serverError}
        onSubmit={(values) => {
          updatePost.mutate(values);
        }}
        onCancel={() => {
          void navigate({
            to: "/entries/$slug",
            params: { slug },
            search: ENTRIES_LIST_DEFAULT_SEARCH,
          });
        }}
      />
    </div>
  );
}

function toEditorValues(post: Entry): PostEditorValues {
  return {
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt ?? "",
    status: post.status,
    meta: post.meta,
  };
}

// Content-shaped skeleton while the existing post fetches: heading +
// title field + slug field + body block + side rail. Keeps layout stable
// so the form doesn't pop in with a visible reflow once the query
// resolves. `role=status` + `aria-live` announces the loading state to
// screen readers; sighted users get the visual shimmer.
function EditorSkeleton({ label }: { label: string }): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="post-editor-loading"
      className="flex max-w-6xl flex-col gap-6"
    >
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
        <aside className="flex flex-col gap-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-24 w-full" />
        </aside>
      </div>
    </div>
  );
}

function NotFoundPlaceholder({ message }: { message: string }): ReactNode {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}
