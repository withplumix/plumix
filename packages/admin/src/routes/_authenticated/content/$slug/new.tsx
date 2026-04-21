import type { PostEditorValues } from "@/components/editor/post-editor-form.js";
import type { ReactNode } from "react";
import { useState } from "react";
import { PostEditorForm } from "@/components/editor/post-editor-form.js";
import { findPostTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useMutation } from "@tanstack/react-query";
import {
  createFileRoute,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";

import type { PostTypeManifestEntry } from "@plumix/core/manifest";
import type { PostStatus } from "@plumix/core/schema";

import { CONTENT_LIST_DEFAULT_SEARCH } from "./index.js";

// Statuses the new-post dropdown should expose. `trash` is omitted — you
// don't create a post straight into the trash bin; the list view has a
// dedicated Trash filter for that workflow.
const NEW_POST_STATUSES: readonly PostStatus[] = [
  "draft",
  "published",
  "scheduled",
];

export const Route = createFileRoute("/_authenticated/content/$slug/new")({
  beforeLoad: ({ context, params }): { postType: PostTypeManifestEntry } => {
    const postType = findPostTypeBySlug(params.slug);
    if (!postType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // Only callers with the create capability see this screen. `edit_own`
    // alone isn't enough — that permission is about editing your own
    // existing posts, not spawning new ones.
    const capability = `${postType.capabilityType ?? postType.name}:create`;
    if (!context.user.capabilities.includes(capability)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw redirect({
        to: "/content/$slug",
        params: { slug: params.slug },
        search: CONTENT_LIST_DEFAULT_SEARCH,
      });
    }
    return { postType };
  },
  component: NewPostRoute,
});

function NewPostRoute(): ReactNode {
  const { postType } = Route.useRouteContext();
  const params = Route.useParams();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const createPost = useMutation({
    mutationFn: (input: PostEditorValues) =>
      orpc.post.create.call({
        type: postType.name,
        title: input.title,
        slug: input.slug,
        content: input.content.length > 0 ? input.content : null,
        excerpt: input.excerpt.length > 0 ? input.excerpt : null,
        status: input.status,
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async (created) => {
      await navigate({
        to: "/content/$slug/$id",
        params: { slug: params.slug, id: String(created.id) },
      });
    },
    onError: (err) => {
      setServerError(err instanceof Error ? err.message : "Couldn't save.");
    },
  });

  const initialValues: PostEditorValues = {
    title: "",
    slug: "",
    content: "",
    excerpt: "",
    status: "draft",
  };

  const singularLower = (
    postType.labels?.singular ?? postType.label
  ).toLowerCase();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">New {singularLower}</h1>
      </div>
      <PostEditorForm
        initialValues={initialValues}
        slugLocked={false}
        availableStatuses={NEW_POST_STATUSES}
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
            to: "/content/$slug",
            params: { slug: params.slug },
            search: CONTENT_LIST_DEFAULT_SEARCH,
          });
        }}
      />
    </div>
  );
}
