import type { PostEditorValues } from "@/components/editor/entry-editor-form.js";
import type { ReactNode } from "react";
import { useState } from "react";
import { EntryConflictDialog } from "@/components/editor/entry-conflict-dialog.js";
import {
  POST_EDITOR_STATUSES,
  PostEditorForm,
} from "@/components/editor/entry-editor-form.js";
import { useEntryFormScope } from "@/components/editor/use-entry-form-scope.js";
import { useParentOptions } from "@/components/editor/use-parent-options.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import { hasCap } from "@/lib/caps.js";
import { ENTRIES_LIST_DEFAULT_SEARCH } from "@/lib/entries.js";
import { findEntryTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { filterTermsForEntryType } from "@/lib/terms.js";
import { ORPCError } from "@orpc/client";
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

interface ConflictState {
  readonly mine: PostEditorValues;
  readonly theirs: Entry | null;
}

// oRPC types `ORPCError.data` as `any`, so the structural cast lives
// in one place rather than at every call site.
function isStaleConflictError(err: unknown): boolean {
  if (!(err instanceof ORPCError)) return false;
  if (err.code !== "CONFLICT") return false;
  const data = err.data as { reason?: unknown };
  return data.reason === "stale_expected_updated_at";
}

export const Route = createFileRoute("/_editor/entries/$slug/$id/edit")({
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
  const [conflict, setConflict] = useState<ConflictState | null>(null);

  const { data: post } = useSuspenseQuery(
    orpc.entry.get.queryOptions({ input: { id: entryId } }),
  );

  const isHierarchical = entryType.isHierarchical === true;

  const updatePost = useMutation({
    mutationFn: ({
      values,
      expectedLiveUpdatedAt,
    }: {
      values: PostEditorValues;
      expectedLiveUpdatedAt: Date | undefined;
    }) =>
      orpc.entry.update.call({
        id: entryId,
        title: values.title,
        slug: values.slug,
        content: values.content,
        excerpt: values.excerpt.length > 0 ? values.excerpt : null,
        status: values.status,
        meta: values.meta,
        terms: filterTermsForEntryType(values.terms, entryType.termTaxonomies),
        ...(isHierarchical ? { parentId: values.parentId } : {}),
        ...(expectedLiveUpdatedAt ? { expectedLiveUpdatedAt } : {}),
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      setConflict(null);
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
    onError: (err, variables) => {
      if (isStaleConflictError(err)) {
        setConflict({ mine: variables.values, theirs: null });
        // Raw client bypasses the React Query cache so the fresh server
        // state shows up in the Compare panel — `fetchQuery` would
        // dedupe against the suspense query that loaded the entry on
        // mount and return the same `post` we already have in memory.
        void orpc.entry.get
          .call({ id: entryId })
          .then((fresh) => {
            setConflict((prev) =>
              prev === null ? prev : { ...prev, theirs: fresh },
            );
          })
          .catch(() => {
            // Best-effort: the dialog still works without "theirs"; the
            // Compare panel renders a Loading state for the missing side.
          });
        return;
      }
      setServerError(err instanceof Error ? err.message : "Couldn't save.");
    },
  });

  function handleKeepMine(): void {
    if (conflict === null) return;
    updatePost.mutate({
      values: conflict.mine,
      expectedLiveUpdatedAt: undefined,
    });
  }

  async function handleTakeTheirs(): Promise<void> {
    setConflict(null);
    await queryClient.invalidateQueries({
      queryKey: orpc.entry.get.queryOptions({ input: { id: entryId } })
        .queryKey,
    });
  }

  const singularLower = (
    entryType.labels?.singular ?? entryType.label
  ).toLowerCase();

  const { metaBoxes, taxonomies } = useEntryFormScope(
    entryType,
    user.capabilities,
  );

  const parentOptions = useParentOptions({
    entryTypeName: entryType.name,
    isHierarchical,
    excludeSelfId: entryId,
  });

  const capNamespace = `entry:${entryType.capabilityType ?? entryType.name}`;
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

  const initialValues: PostEditorValues = toEditorValues(post, entryType);

  return (
    <>
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
        supports={entryType.supports}
        metaBoxes={metaBoxes}
        taxonomies={taxonomies}
        isHierarchical={isHierarchical}
        parentOptions={parentOptions}
        headline={`Edit ${singularLower}`}
        submitLabel="Save"
        // For the edit path, the post-save remount (keyed on
        // `updatedAt`) resets the form's isDirty to false — so the
        // blocker naturally stops prompting once the mutation settles.
        // No need to carry `isSuccess` across, unlike the new-post
        // route which has a navigation to bridge.
        isSubmitting={updatePost.isPending}
        serverError={updatePost.isPending ? null : serverError}
        onSubmit={(values) => {
          updatePost.mutate({
            values,
            expectedLiveUpdatedAt: post.updatedAt,
          });
        }}
        onCancel={() => {
          void navigate({
            to: "/entries/$slug",
            params: { slug },
            search: ENTRIES_LIST_DEFAULT_SEARCH,
          });
        }}
      />
      <EntryConflictDialog
        open={conflict !== null}
        singularLabel={singularLower}
        mine={conflict?.mine ?? null}
        theirs={conflict?.theirs ?? null}
        onKeepMine={handleKeepMine}
        onTakeTheirs={() => {
          void handleTakeTheirs();
        }}
        onOpenChange={(open) => {
          if (!open) setConflict(null);
        }}
      />
    </>
  );
}

function toEditorValues(
  post: Entry & { terms?: Record<string, readonly number[]> },
  entryType: { readonly termTaxonomies?: readonly string[] },
): PostEditorValues {
  // Seed an empty array slot per registered taxonomy first, then
  // override with the post's existing assignments. Same rationale as
  // create.tsx: the form's valibot schema validates `terms` as
  // `Record<string, number[]>` and the per-taxonomy FormField
  // registers `terms.<taxonomy>` at mount; un-seeded slots end up
  // `undefined` and submit fails with "Invalid type: Expected Array
  // but received undefined".
  const seededTerms = Object.fromEntries(
    (entryType.termTaxonomies ?? []).map((tax) => [tax, [] as number[]]),
  );
  const postTerms = Object.fromEntries(
    Object.entries(post.terms ?? {}).map(([k, v]) => [k, [...v]]),
  );
  return {
    title: post.title,
    slug: post.slug,
    content: post.content,
    excerpt: post.excerpt ?? "",
    status: post.status,
    meta: post.meta,
    terms: { ...seededTerms, ...postTerms },
    parentId: post.parentId,
  };
}

// Full-screen-editor-shaped skeleton: sticky header line + centered
// canvas placeholders + right rail. Layout mirrors the real editor so
// the form doesn't pop in with a visible reflow once the query
// resolves. `role=status` + `aria-live` announces the loading state to
// screen readers; sighted users get the visual shimmer.
function EditorSkeleton({ label }: { label: string }): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label}
      data-testid="post-editor-loading"
      className="flex flex-1 flex-col"
    >
      <div className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-9 w-20" />
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex flex-1 overflow-auto">
          <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-8 py-10">
            <Skeleton className="h-10 w-2/3" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
        {/* Width hardcoded to 16rem to match shadcn's `SIDEBAR_WIDTH`
            constant — the `--sidebar-width` CSS variable isn't in scope
            here because `SidebarProvider` mounts with the form below. */}
        <aside className="flex w-64 shrink-0 flex-col gap-4 border-l p-4 max-md:hidden">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
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
