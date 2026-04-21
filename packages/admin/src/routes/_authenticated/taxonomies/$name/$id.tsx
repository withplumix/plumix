import type { ReactNode } from "react";
import { useState } from "react";
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
import { Skeleton } from "@/components/ui/skeleton.js";
import { hasCap } from "@/lib/caps.js";
import { findTaxonomyByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import type { TaxonomyManifestEntry } from "@plumix/core/manifest";

import { TAXONOMY_LIST_DEFAULT_SEARCH } from "./-constants.js";
import { mapTermError } from "./new.js";

export const Route = createFileRoute("/_authenticated/taxonomies/$name/$id")({
  parseParams: (params) => ({
    name: params.name,
    id: Number(params.id),
  }),
  beforeLoad: ({ context, params }): { taxonomy: TaxonomyManifestEntry } => {
    const taxonomy = findTaxonomyByName(params.name);
    if (!taxonomy) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // Minimum bar is `:read`; edit/delete actions gate separately
    // below so a read-only user can still land on the screen.
    if (!hasCap(context.user.capabilities, `${taxonomy.name}:read`)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { taxonomy };
  },
  component: EditTermRoute,
});

function EditTermRoute(): ReactNode {
  const { id } = Route.useParams();
  const { user, taxonomy } = Route.useRouteContext();
  const termId = Number(id);

  const canEdit = hasCap(user.capabilities, `${taxonomy.name}:edit`);
  const canDelete = hasCap(user.capabilities, `${taxonomy.name}:delete`);
  const isHierarchical = taxonomy.isHierarchical === true;

  const query = useQuery(orpc.term.get.queryOptions({ input: { id: termId } }));
  // Pull siblings for the parent picker; only relevant for
  // hierarchical taxonomies. Excludes this term and its descendants so
  // the picker can't suggest a cycle the server would reject anyway.
  const siblings = useQuery({
    ...orpc.term.list.queryOptions({
      input: { taxonomy: taxonomy.name, limit: 200 },
    }),
    enabled: isHierarchical,
  });

  if (query.isPending) return <EditSkeleton />;
  if (query.isError) {
    return (
      <NotFoundPlaceholder message="Couldn't load that term. It may have been deleted." />
    );
  }

  const term = query.data;
  const excludeIds = isHierarchical
    ? descendantIds(siblings.data ?? [], term.id)
    : new Set<number>();
  const parentOptions = isHierarchical
    ? parentPickerOptions(siblings.data ?? [], excludeIds)
    : [];

  return (
    <EditTermContent
      // Keep the form fresh after a save — same pattern as the
      // user/post edit screens.
      key={term.id}
      taxonomy={taxonomy}
      term={term}
      isHierarchical={isHierarchical}
      parentOptions={parentOptions}
      canEdit={canEdit}
      canDelete={canDelete}
      onRefetch={() => {
        void query.refetch();
      }}
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
  onRefetch,
}: {
  readonly taxonomy: TaxonomyManifestEntry;
  readonly term: {
    readonly id: number;
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
    readonly parentId: number | null;
  };
  readonly isHierarchical: boolean;
  readonly parentOptions: readonly {
    readonly id: number;
    readonly label: string;
  }[];
  readonly canEdit: boolean;
  readonly canDelete: boolean;
  readonly onRefetch: () => void;
}): ReactNode {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const updateTerm = useMutation({
    mutationFn: (values: {
      name: string;
      slug: string;
      description: string;
      parentId: number | null;
    }) =>
      orpc.term.update.call({
        id: term.id,
        name: values.name,
        slug: values.slug.length > 0 ? values.slug : undefined,
        description: values.description.length > 0 ? values.description : null,
        parentId: values.parentId,
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: () => {
      onRefetch();
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
            }}
            isHierarchical={isHierarchical}
            parentOptions={parentOptions}
            isSubmitting={updateTerm.isPending || !canEdit}
            serverError={serverError}
            submitLabel="Save changes"
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
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const deleteTerm = useMutation({
    mutationFn: () => orpc.term.delete.call({ id: termId }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: () => {
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
            Removes this term and unassigns it from any posts that use it.
            Descendants are promoted to root level (their posts keep their other
            term assignments).
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
          Post assignments to this term are removed. If the term has children,
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

function EditSkeleton(): ReactNode {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Loading term"
      data-testid="term-edit-loading"
      className="mx-auto flex w-full max-w-xl flex-col gap-4"
    >
      <Skeleton className="h-4 w-24" />
      <Card>
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-72" />
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
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
