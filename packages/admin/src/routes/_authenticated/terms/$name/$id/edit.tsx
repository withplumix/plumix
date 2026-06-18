import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { ErrorPlaceholder } from "@/components/error-placeholder.js";
import { FormEditSkeleton } from "@/components/form/edit-skeleton.js";
import { TermForm } from "@/components/taxonomy/term-form.js";
import {
  descendantIds,
  parentPickerOptions,
} from "@/components/taxonomy/tree.js";
import { hasCap } from "@/lib/caps.js";
import {
  findTermTaxonomyByName,
  termMetaBoxesForTermTaxonomy,
} from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { termTaxonomyLabel } from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
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
import { Alert, AlertDescription } from "@plumix/admin-ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@plumix/admin-ui/alert-dialog";
import { Button } from "@plumix/admin-ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@plumix/admin-ui/card";
import { seedFromMetaBoxes } from "@plumix/core/manifest";
import { idPathParam } from "@plumix/core/validation";

import { TAXONOMY_LIST_DEFAULT_SEARCH } from "../-constants.js";
import { useTermErrorMessage } from "../-errors.js";

const M = {
  saveFallback: defineMessage({
    id: "terms.edit.error.saveFallback",
    message: "Couldn't save the changes. Try again.",
  }),
  deleteFallback: defineMessage({
    id: "terms.edit.error.deleteFallback",
    message: "Couldn't delete the term. Try again.",
  }),
  notFoundMessage: defineMessage({
    id: "terms.edit.notFound.message",
    message: "Couldn't load that term. It may have been deleted.",
  }),
  loadingAria: defineMessage({
    id: "terms.edit.loadingAria",
    message: "Loading term",
  }),
  descendantsHint: defineMessage({
    id: "terms.edit.descendantsHint",
    message: " — descendants can't be picked as parent.",
  }),
  submit: defineMessage({
    id: "terms.edit.submit",
    message: "Save changes",
  }),
} satisfies Record<string, MessageDescriptor>;

export const Route = createFileRoute("/_authenticated/terms/$name/$id/edit")({
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
  pendingComponent: PendingComponent,
  errorComponent: ErrorComponent,
  component: EditTermRoute,
});

function PendingComponent(): ReactNode {
  const renderLabel = useLabel();
  return (
    <FormEditSkeleton
      ariaLabel={renderLabel(M.loadingAria)}
      testId="term-edit-loading"
    />
  );
}

function ErrorComponent(): ReactNode {
  const renderLabel = useLabel();
  return <NotFoundPlaceholder message={renderLabel(M.notFoundMessage)} />;
}

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
  const renderLabel = useLabel();
  const mapTermError = useTermErrorMessage();
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
      setServerError(mapTermError(err, renderLabel(M.saveFallback)));
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        to="/terms/$name"
        params={{ name: taxonomy.name }}
        search={TAXONOMY_LIST_DEFAULT_SEARCH}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="term-edit-back-link"
      >
        <ArrowLeft className="size-4 rtl:rotate-180" />
        {renderLabel(termTaxonomyLabel(taxonomy, "allItems"))}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="term-edit-heading">
              {renderLabel(termTaxonomyLabel(taxonomy, "editItem"))}
            </h1>
          </CardTitle>
          <CardDescription>
            {term.name}
            {isHierarchical ? renderLabel(M.descendantsHint) : ""}
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
            submitLabel={renderLabel(M.submit)}
            metaBoxes={metaBoxes}
            onSubmit={(values) => {
              updateTerm.mutate(values);
            }}
            onCancel={() => {
              void navigate({
                to: "/terms/$name",
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
  const renderLabel = useLabel();
  const mapTermError = useTermErrorMessage();
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
        to: "/terms/$name",
        params: { name: taxonomyName },
        search: TAXONOMY_LIST_DEFAULT_SEARCH,
      });
    },
    onError: (err) => {
      setServerError(mapTermError(err, renderLabel(M.deleteFallback)));
    },
  });

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="text-destructive">
            <Trans id="terms.edit.delete.cardTitle" message="Delete term" />
          </CardTitle>
          <CardDescription>
            <Trans
              id="terms.edit.delete.cardDescription"
              message="Removes this term and unassigns it from any entries that use it. Descendants are promoted to root level (their entries keep their other term assignments)."
            />
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
            <Trans id="terms.edit.delete.button" message="Delete term" />
          </Button>
        </CardContent>
      </Card>

      <AlertDialog
        open={confirming}
        onOpenChange={(open) => {
          if (!open) {
            setConfirming(false);
            setServerError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans
                id="terms.edit.delete.dialogTitle"
                message="Delete {termName}?"
                values={{ termName: <bdi>{termName}</bdi> }}
                comment="termName: the taxonomy term being deleted"
              />
            </AlertDialogTitle>
            <AlertDialogDescription>
              <Trans
                id="terms.edit.delete.dialogDescription"
                message="Entry assignments to this term are removed. If the term has children, they become root-level automatically."
              />
            </AlertDialogDescription>
          </AlertDialogHeader>
          {serverError ? (
            <Alert variant="destructive" data-testid="term-delete-error">
              <AlertDescription>{serverError}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTerm.isPending}>
              <Trans id="terms.edit.delete.cancel" message="Cancel" />
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="term-delete-confirm-button"
              disabled={deleteTerm.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                deleteTerm.mutate();
              }}
            >
              {deleteTerm.isPending ? (
                <Trans id="terms.edit.delete.deleting" message="Deleting…" />
              ) : (
                <Trans
                  id="terms.edit.delete.confirm"
                  message="Delete forever"
                />
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NotFoundPlaceholder({ message }: { message: string }): ReactNode {
  return (
    <ErrorPlaceholder
      title={<Trans id="terms.edit.notFound.title" message="Not found" />}
      description={message}
    />
  );
}
