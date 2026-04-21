import type { PostEditorValues } from "@/components/editor/post-editor-form.js";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  POST_EDITOR_STATUSES,
  PostEditorForm,
} from "@/components/editor/post-editor-form.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { hasCap } from "@/lib/caps.js";
import { findPostTypeBySlug, metaBoxesForPostType } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";

import type { PostTypeManifestEntry } from "@plumix/core/manifest";
import type { PostWithMeta } from "@plumix/core/schema";

import { CONTENT_LIST_DEFAULT_SEARCH } from "./-constants.js";

export const Route = createFileRoute("/_authenticated/content/$slug/$id")({
  beforeLoad: ({ params }): { postType: PostTypeManifestEntry } => {
    const postType = findPostTypeBySlug(params.slug);
    if (!postType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    const postId = Number(params.id);
    if (Number.isNaN(postId) || postId < 1) {
      // Non-numeric or negative ids can't resolve — bounce back to the
      // post-type list rather than firing an RPC with garbage.
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({
        to: "/content/$slug",
        params: { slug: params.slug },
        search: CONTENT_LIST_DEFAULT_SEARCH,
      });
    }
    return { postType };
  },
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.post.get.queryOptions({ input: { id: Number(params.id) } }),
    ),
  // Pending/error screens are per-slug so copy reflects the actual
  // type ("page", "product") instead of hardcoding "post".
  pendingComponent: EditPostPendingScreen,
  errorComponent: EditPostErrorScreen,
  component: EditPostRoute,
});

function postTypeSingular(slug: string): string {
  const postType = findPostTypeBySlug(slug);
  return (
    postType?.labels?.singular ??
    postType?.label ??
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
  const { user, postType } = Route.useRouteContext();
  const params = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const postId = Number(params.id);
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: post } = useSuspenseQuery(
    orpc.post.get.queryOptions({ input: { id: postId } }),
  );

  const updatePost = useMutation({
    mutationFn: (input: PostEditorValues) =>
      orpc.post.update.call({
        id: postId,
        title: input.title,
        slug: input.slug,
        content: input.content.length > 0 ? input.content : null,
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
          queryKey: orpc.post.get.queryOptions({ input: { id: postId } })
            .queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.post.list.key({ input: { type: postType.name } }),
        }),
      ]);
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Couldn't save.");
    },
  });

  const singularLower = (
    postType.labels?.singular ?? postType.label
  ).toLowerCase();

  const metaBoxes = useMemo(
    () => metaBoxesForPostType(postType.name, user.capabilities),
    [postType.name, user.capabilities],
  );

  const capNamespace = postType.capabilityType ?? postType.name;
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
        // blocker cleanly. Switching posts (different id → different
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
            to: "/content/$slug",
            params: { slug: params.slug },
            search: CONTENT_LIST_DEFAULT_SEARCH,
          });
        }}
      />
    </div>
  );
}

function toEditorValues(post: PostWithMeta): PostEditorValues {
  return {
    title: post.title,
    slug: post.slug,
    content: post.content ?? "",
    excerpt: post.excerpt ?? "",
    status: post.status,
    // `post.meta` ships alongside the post row (server hydrates it from
    // post_meta, typed against the plugin registry). Passing as-is — the
    // editor form treats values as `unknown` and the field dispatcher
    // handles per-type coercion on render.
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
