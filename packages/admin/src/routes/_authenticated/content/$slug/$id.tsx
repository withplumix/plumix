import type { PostEditorValues } from "@/components/editor/post-editor-form.js";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import {
  POST_EDITOR_STATUSES,
  PostEditorForm,
} from "@/components/editor/post-editor-form.js";
import { findPostTypeBySlug, metaBoxesForPostType } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";

import type { PostTypeManifestEntry } from "@plumix/core/manifest";
import type { Post } from "@plumix/core/schema";

import { CONTENT_LIST_DEFAULT_SEARCH } from "./index.js";

export const Route = createFileRoute("/_authenticated/content/$slug/$id")({
  beforeLoad: ({ params }): { postType: PostTypeManifestEntry } => {
    const postType = findPostTypeBySlug(params.slug);
    if (!postType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { postType };
  },
  component: EditPostRoute,
});

function EditPostRoute(): ReactNode {
  const { user, postType } = Route.useRouteContext();
  const params = Route.useParams();
  const navigate = useNavigate();
  const postId = Number(params.id);
  const [serverError, setServerError] = useState<string | null>(null);

  const query = useQuery(orpc.post.get.queryOptions({ input: { id: postId } }));

  const updatePost = useMutation({
    mutationFn: (input: PostEditorValues) =>
      orpc.post.update.call({
        id: postId,
        title: input.title,
        slug: input.slug,
        content: input.content.length > 0 ? input.content : null,
        excerpt: input.excerpt.length > 0 ? input.excerpt : null,
        status: input.status,
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: () => {
      void query.refetch();
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Couldn't save.");
    },
  });

  const singularLower = (
    postType.labels?.singular ?? postType.label
  ).toLowerCase();

  // Meta boxes registered for this post type, filtered by the user's
  // capabilities. Computed unconditionally (before any early returns)
  // to keep the hook order stable across render paths.
  const metaBoxes = useMemo(
    () => metaBoxesForPostType(postType.name, user.capabilities),
    [postType.name, user.capabilities],
  );

  if (Number.isNaN(postId) || postId < 1) {
    // Defensive: `$id` param is a string; reject anything non-numeric
    // rather than hitting the RPC with garbage. The router could enforce
    // this via a loader, but the dedicated check keeps the error local.
    return (
      <NotFoundPlaceholder message="The post id in the URL isn't a number." />
    );
  }

  if (query.isPending) {
    return <LoadingPlaceholder label={`Loading ${singularLower}`} />;
  }

  if (query.isError) {
    return (
      <NotFoundPlaceholder
        message={`Couldn't load that ${singularLower}. It may have been deleted.`}
      />
    );
  }

  const post = query.data;
  const canEditAny = user.capabilities.includes(
    `${postType.capabilityType ?? postType.name}:edit_any`,
  );
  const canEditOwn =
    post.authorId === user.id &&
    user.capabilities.includes(
      `${postType.capabilityType ?? postType.name}:edit_own`,
    );
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

function toEditorValues(post: Post): PostEditorValues {
  return {
    title: post.title,
    slug: post.slug,
    content: post.content ?? "",
    excerpt: post.excerpt ?? "",
    status: post.status,
    // Meta values start empty — the `Post` row doesn't carry meta yet.
    // The next PR wires `post.meta` persistence; today the editor renders
    // empty boxes and submitted meta is dropped by the parent route.
    meta: {},
  };
}

function LoadingPlaceholder({ label }: { label: string }): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      className="text-muted-foreground text-sm"
    >
      {label}…
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
