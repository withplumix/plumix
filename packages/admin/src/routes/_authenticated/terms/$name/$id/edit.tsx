import type { MetaFieldServerError } from "@/lib/meta-field-errors.js";
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
import { useEditingCopy } from "@/editor/use-editing-copy.js";
import { hasCap } from "@/lib/caps.js";
import {
  findTermTaxonomyByName,
  termMetaBoxesForTermTaxonomy,
} from "@/lib/manifest.js";
import { extractMetaFieldErrors } from "@/lib/meta-field-errors.js";
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
import * as v from "valibot";

import type { ResolvedMeta } from "@plumix/core";
import type { EditingCopy } from "@plumix/core/admin";
import type {
  TermMetaBoxManifestEntry,
  TermTaxonomyManifestEntry,
} from "@plumix/core/manifest";
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
import { ArrowLeft } from "@plumix/admin-ui/icons";
import {
  seedFromMetaBoxes,
  termTaxonomyCapability,
} from "@plumix/core/manifest";
import { idPathParam } from "@plumix/core/validation";

import { TAXONOMY_LIST_DEFAULT_SEARCH } from "../-constants.js";
import { describeTermError } from "../-errors.js";

const TERM_EDITING_COPY: EditingCopy = {
  conflictTitle: defineMessage({
    id: "editor.conflict.title.term",
    message: "This term changed since you opened it",
  }),
  conflictUntimed: defineMessage({
    id: "editor.conflict.descriptionUntimed.term",
    message:
      "It was saved elsewhere. Your changes are kept here and haven't been saved.",
  }),
  heldBy: defineMessage({
    id: "editor.lease.heldBy.term",
    message: "{name} is editing this term (since {time})",
    comment:
      "name: the editing user's display name or email; time: a formatted date and time",
  }),
  lost: defineMessage({
    id: "editor.lease.lost.term",
    message:
      "{name} took over editing this term at {time}. Your unsaved changes are shown here but weren't saved.",
    comment: "name: the user who took over; time: a formatted date and time",
  }),
};

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
    if (
      !hasCap(
        context.user.capabilities,
        termTaxonomyCapability(taxonomy, "read"),
      )
    ) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { taxonomy };
  },
  // Siblings load inline in the component (not here) so a flaky list
  // fetch degrades the parent-picker to empty instead of nuking the
  // whole edit screen via errorComponent.
  loader: ({ context, params }) =>
    context.queryClient.query({
      ...orpc.term.get.queryOptions({ input: { id: params.id } }),
      staleTime: "static",
    }),
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
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const renderLabel = useLabel();
  const [reseedNonce, setReseedNonce] = useState(0);
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );
  const [serverFieldErrors, setServerFieldErrors] = useState<
    readonly MetaFieldServerError[] | null
  >(null);

  const canEdit = hasCap(
    user.capabilities,
    termTaxonomyCapability(taxonomy, "edit"),
  );
  const canDelete = hasCap(
    user.capabilities,
    termTaxonomyCapability(taxonomy, "delete"),
  );
  const isHierarchical = taxonomy.isHierarchical === true;
  const metaBoxes = termMetaBoxesForTermTaxonomy(
    taxonomy.name,
    user.capabilities,
  );

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

  const backToList = (): void => {
    void navigate({
      to: "/terms/$name",
      params: { name: taxonomy.name },
      search: TAXONOMY_LIST_DEFAULT_SEARCH,
    });
  };

  // Held across reseeds, so remounting the form never gives the lease up.
  const editing = useEditingCopy({
    kind: "term",
    id: termId,
    etag: term.etag,
    userId: user.id,
    copy: TERM_EDITING_COPY,
    save: async (ifMatch, values: TermFormValues) => {
      const saved = await orpc.term.update.call({
        id: termId,
        ifMatch,
        name: values.name,
        slug: values.slug.length > 0 ? values.slug : undefined,
        description: values.description.length > 0 ? values.description : null,
        parentId: values.parentId,
        // Only ship meta keys the current user can actually see (the
        // capability gate hides entire boxes); empty object is a no-op
        // server-side.
        meta: metaBoxes.length > 0 ? values.meta : undefined,
      });
      // List variants are scoped by `taxonomy` so sibling termTaxonomies
      // don't needlessly refetch.
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: orpc.term.get.queryOptions({ input: { id: termId } })
            .queryKey,
        }),
        queryClient.invalidateQueries({
          queryKey: orpc.term.list.key({
            input: { taxonomy: taxonomy.name },
          }),
        }),
      ]);
      return saved;
    },
    readSaved: async () =>
      termValues(await orpc.term.get.call({ id: termId }), metaBoxes),
    reload: async () => {
      const saved = await queryClient.query({
        ...orpc.term.get.queryOptions({ input: { id: termId } }),
        staleTime: 0,
      });
      setServerError(null);
      setServerFieldErrors(null);
      setReseedNonce((n) => n + 1);
      return saved.etag;
    },
    onFailed: (err) => {
      // Path-addressed meta rejections render inline on the offending
      // inputs; everything else keeps the banner mapping.
      const fieldErrors = extractMetaFieldErrors(err);
      if (fieldErrors) {
        setServerFieldErrors(fieldErrors);
        return;
      }
      setServerError(describeTermError(err, M.saveFallback));
    },
    onBack: backToList,
  });
  const updateTerm = useMutation({
    mutationFn: (values: TermFormValues) => editing.save(values),
    onMutate: () => {
      setServerError(null);
      setServerFieldErrors(null);
    },
  });

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
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      {editing.dialog}
      {editing.banner}
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
          <fieldset
            disabled={editing.readOnly}
            className="contents"
            data-testid="term-edit-fieldset"
          >
            <TermForm
              // A save adopts its response's etag in place; only Load theirs
              // and Take over remount the form on the saved term.
              key={`${String(term.id)}:${String(reseedNonce)}`}
              initialValues={termValues(term, metaBoxes)}
              isHierarchical={isHierarchical}
              parentOptions={parentOptions}
              isSubmitting={updateTerm.isPending || !canEdit}
              serverError={serverError}
              serverFieldErrors={serverFieldErrors}
              submitLabel={renderLabel(M.submit)}
              metaBoxes={metaBoxes}
              onSubmit={(values) => {
                updateTerm.mutate(values);
              }}
              onCancel={backToList}
            />
          </fieldset>
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

interface TermFormValues {
  name: string;
  slug: string;
  description: string;
  parentId: number | null;
  meta: ResolvedMeta;
}

function termValues(
  term: {
    readonly name: string;
    readonly slug: string;
    readonly description: string | null;
    readonly parentId: number | null;
    readonly meta?: ResolvedMeta;
  },
  metaBoxes: readonly TermMetaBoxManifestEntry[],
): TermFormValues {
  return {
    name: term.name,
    slug: term.slug,
    description: term.description ?? "",
    parentId: term.parentId,
    meta: seedFromMetaBoxes(metaBoxes, term.meta),
  };
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
  const [confirming, setConfirming] = useState(false);
  const [serverError, setServerError] = useState<MessageDescriptor | null>(
    null,
  );

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
      setServerError(describeTermError(err, M.deleteFallback));
    },
  });

  return (
    <>
      <Card variant="destructive">
        <CardHeader>
          <CardTitle>
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
              <AlertDescription>{renderLabel(serverError)}</AlertDescription>
            </Alert>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteTerm.isPending}>
              <Trans id="terms.edit.delete.cancel" message="Cancel" />
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="term-delete-confirm-button"
              disabled={deleteTerm.isPending}
              variant="destructive"
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
