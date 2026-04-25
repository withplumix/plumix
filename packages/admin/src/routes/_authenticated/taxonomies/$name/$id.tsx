import type { ReactNode } from "react";
import { useState } from "react";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { TermForm } from "@/components/taxonomy/term-form.js";
import {
  descendantIds,
  parentPickerOptions,
} from "@/components/taxonomy/tree.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { hasCap } from "@/lib/caps.js";
import {
  findTermTaxonomyByName,
  termMetaBoxesForTermTaxonomy,
} from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import * as v from "valibot";

import type { TermTaxonomyManifestEntry } from "@plumix/core/manifest";
import { seedFromMetaBoxes } from "@plumix/core/manifest";
import { idPathParam } from "@plumix/core/validation";

import { TAXONOMY_LIST_DEFAULT_SEARCH } from "./-constants.js";
import { mapTermError } from "./-errors.js";

export const Route = createFileRoute("/_authenticated/taxonomies/$name/$id")({
  // Reject invalid ids as a router 404 before `beforeLoad` / `loader`
  // fire — no RPC, no stale-id flicker through the cache.
  params: {
    parse: (raw) => {
      const result = v.safeParse(idPathParam, raw.id);
      if (!result.success) {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
        throw notFound();
      }
      return { name: raw.name, id: result.output };
    },
  },
  beforeLoad: ({
    context,
    params,
  }): { taxonomy: TermTaxonomyManifestEntry } => {
    const taxonomy = findTermTaxonomyByName(params.name);
    if (!taxonomy) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // Minimum bar is `:read`; edit/delete actions gate separately
    // below so a read-only user can still land on the screen.
    if (!hasCap(context.user.capabilities, `term:${taxonomy.name}:read`)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { taxonomy };
  },
  // Siblings load inline in the component (not here) so a flaky list
  // fetch degrades the parent-picker to empty instead of nuking the
  // whole edit screen via errorComponent.
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(
      orpc.term.get.queryOptions({ input: { id: params.id } }),
    ),
  pendingComponent: () => (
    <FormEditSkeleton ariaLabel="Loading term" testId="term-edit-loading" />
  ),
  errorComponent: () => (
    <NotFoundPlaceholder message="Couldn't load that term. It may have been deleted." />
  ),
  component: EditTermRoute,
});

function EditTermRoute(): ReactNode {
  const { id: termId } = Route.useParams();
  const { user, taxonomy } = Route.useRouteContext();

  const canEdit = hasCap(user.capabilities, `term:${taxonomy.name}:edit`);
  const canDelete = hasCap(user.capabilities, `term:${taxonomy.name}:delete`);
  const isHierarchical = taxonomy.isHierarchical === true;

  const { data: term } = useSuspenseQuery(
    orpc.term.get.queryOptions({ input: { id: termId } }),
  );
  const siblingsQuery = useQuery({
    ...orpc.term.list.queryOptions({
      input: { taxonomy: taxonomy.name, limit: 200 },
    }),
    enabled: isHierarchical,
  });
  const siblings = siblingsQuery.data ?? [];

  // Always seed the exclusion with the term's own id so self-selection
  // is blocked regardless of subtree resolution — client-side mirror
  // of the server's `parent_cycle` guard.
  const excludeIds = isHierarchical
    ? new Set<number>([term.id, ...descendantIds(siblings, term.id)])
    : new Set<number>();
  const parentOptions = isHierarchical
    ? parentPickerOptions(siblings, excludeIds)
    : [];

  return (
    <EditTermContent
      // Keep the form fresh after a term id change (navigation between
      // sibling terms). Server-sanitize reseed after save doesn't
      // apply here — the terms table has no `updatedAt`, so we can't
      // detect a save-driven refetch the way user/entry edit do.
      key={term.id}
      taxonomy={taxonomy}
      term={term}
      isHierarchical={isHierarchical}
      parentOptions={parentOptions}
      canEdit={canEdit}
      canDelete={canDelete}
    />
  );
}

function EditTermContent({
  taxonomy,
  term,
  isHierarchical,
  parentOptions,
  canEdit,
  canDelete,
}: {
  readonly taxonomy: TermTaxonomyManifestEntry;
  readonly term: {
    readonly id: number;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
    readonly parentId: number | null;
    readonly meta?: Readonly<Record<string, unknown>>;
  };
  readonly isHierarchical: boolean;
  readonly parentOptions: readonly {
    readonly id: number;
    readonly label: string;
  }[];
  readonly canEdit: boolean;
  readonly canDelete: boolean;
}): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [serverError, setServerError] = useState<string | null>(null);
  const { user } = Route.useRouteContext();
  const metaBoxes = termMetaBoxesForTermTaxonomy(
    taxonomy.name,
    user.capabilities,
  );

  const updateTerm = useMutation({
    mutationFn: (values: {
      name: string;
      slug: string;
      description: string;
      parentId: number | null;
      meta: Readonly<Record<string, unknown>>;
    }) =>
      orpc.term.update.call({
        id: term.id,
        name: values.name,
        slug: values.slug.length > 0 ? values.slug : undefined,
        description: values.description.length > 0 ? values.description : null,
        parentId: values.parentId,
        // Only ship meta keys the current user can actually see (the
        // capability gate hides entire boxes); empty object is a no-op
        // server-side.
        meta: metaBoxes.length > 0 ? values.meta : undefined,
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      // List variants are scoped by `taxonomy` so sibling termTaxonomies
      // don't needlessly refetch. Parent route remounts via the
      // updatedAt key so the refetched row reseeds the form.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.term.get.queryOptions({ input: { id: term.id } })
            .queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.term.list.key({
            input: { taxonomy: taxonomy.name },
          }),
        }),
      ]);
    },
    onError: (err) => {
      setServerError(
        mapTermError(err, "Couldn't save the changes. Try again."),
      );
    },
  });

  const singularLower = (
    taxonomy.labels?.singular ?? taxonomy.label
  ).toLowerCase();

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        to="/taxonomies/$name"
        params={{ name: taxonomy.name }}
        search={TAXONOMY_LIST_DEFAULT_SEARCH}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="term-edit-back-link"
      >
        <ArrowLeft className="size-4" />
        Back to {taxonomy.label.toLowerCase()}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="term-edit-heading">Edit {singularLower}</h1>
          </CardTitle>
          <CardDescription>
            {term.name}
            {isHierarchical ? " — descendants can't be picked as parent." : ""}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TermForm
            initialValues={{
              name: term.name,
              slug: term.slug,
              description: term.description ?? "",
              parentId: term.parentId,
              meta: seedFromMetaBoxes(metaBoxes, term.meta),
            }}
            isHierarchical={isHierarchical}
            parentOptions={parentOptions}
            isSubmitting={updateTerm.isPending || !canEdit}
            serverError={serverError}
            submitLabel="Save changes"
            metaBoxes={metaBoxes}
            onSubmit={(values) => {
              updateTerm.mutate(values);
            }}
            onCancel={() => {
              void navigate({
                to: "/taxonomies/$name",
                params: { name: taxonomy.name },
                search: TAXONOMY_LIST_DEFAULT_SEARCH,
              });
            }}
          />
        </CardContent>
      </Card>

      {canDelete ? (
        <DeleteCard
          taxonomyName={taxonomy.name}
          termId={term.id}
          termName={term.name}
        />
      ) : null}
    </div>
  );
}

function DeleteCard({
  taxonomyName,
  termId,
  termName,
}: {
  readonly taxonomyName: string;
  readonly termId: number;
  readonly termName: string;
}): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const deleteTerm = useMutation({
    mutationFn: () => orpc.term.delete.call({ id: termId }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      // Evict cached list entries before navigating back — otherwise
      // the list route shows the deleted row within its staleTime
      // window. Scoped by taxonomy so sibling termTaxonomies don't
      // needlessly refetch.
      await queryClient.invalidateQueries({
        queryKey: orpc.term.list.key({ input: { taxonomy: taxonomyName } }),
      });
      void navigate({
        to: "/taxonomies/$name",
        params: { name: taxonomyName },
        search: TAXONOMY_LIST_DEFAULT_SEARCH,
      });
    },
    onError: (err) => {
      setServerError(mapTermError(err, "Couldn't delete the term. Try again."));
    },
  });

  if (!confirming) {
    return (
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">Delete term</CardTitle>
          <CardDescription>
            Removes this term and unassigns it from any entries that use it.
            Descendants are promoted to root level (their entries keep their
            other term assignments).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="destructive"
            onClick={() => {
              setConfirming(true);
            }}
            data-testid="term-edit-delete-button"
          >
            Delete term
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">
          Confirm delete: {termName}
        </CardTitle>
        <CardDescription>
          Entry assignments to this term are removed. If the term has children,
          they become root-level automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {serverError ? (
          <Alert variant="destructive" data-testid="term-delete-error">
            <AlertDescription>{serverError}</AlertDescription>
          </Alert>
        ) : null}

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setConfirming(false);
              setServerError(null);
            }}
            disabled={deleteTerm.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={() => {
              deleteTerm.mutate();
            }}
            disabled={deleteTerm.isPending}
            data-testid="term-delete-confirm-button"
          >
            {deleteTerm.isPending ? "Deleting…" : "Delete forever"}
          </Button>
        </div>
      </CardContent>
    </Card>
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
