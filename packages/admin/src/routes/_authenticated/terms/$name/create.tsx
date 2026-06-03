import type { MessageDescriptor } from "@lingui/core";
import type { ReactNode } from "react";
import { useState } from "react";
import { TermForm } from "@/components/taxonomy/term-form.js";
import { parentPickerOptions } from "@/components/taxonomy/tree.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { hasCap } from "@/lib/caps.js";
import { findTermTaxonomyByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { termTaxonomyLabel } from "@/lib/type-labels.js";
import { useLabel } from "@/lib/use-label.js";
import { defineMessage } from "@lingui/core/macro";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import type { TermTaxonomyManifestEntry } from "@plumix/core/manifest";
import { slugify } from "@plumix/core/slugify";

import { TAXONOMY_LIST_DEFAULT_SEARCH } from "./-constants.js";
import { useTermErrorMessage } from "./-errors.js";

const M = {
  createFallback: defineMessage({
    id: "terms.create.error.createFallback",
    message: "Couldn't create the term. Try again.",
  }),
  emptySlug: defineMessage({
    id: "terms.create.error.emptySlug",
    message:
      "Couldn't derive a slug from that name — please type one manually.",
  }),
  hierarchicalDescription: defineMessage({
    id: "terms.create.description.hierarchical",
    message:
      "Pick a parent to nest this term, or leave empty for a root-level term.",
  }),
  flatDescription: defineMessage({
    id: "terms.create.description.flat",
    message: "Group content by adding a new term.",
  }),
} satisfies Record<string, MessageDescriptor>;

export const Route = createFileRoute("/_authenticated/terms/$name/create")({
  beforeLoad: ({
    context,
    params,
  }): { taxonomy: TermTaxonomyManifestEntry } => {
    const taxonomy = findTermTaxonomyByName(params.name);
    if (!taxonomy) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // `term.create` requires `${name}:edit` — gate the route too so a
    // caller without edit doesn't land on a form that will 403 on save.
    if (!hasCap(context.user.capabilities, `term:${taxonomy.name}:edit`)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw redirect({
        to: "/terms/$name",
        params: { name: params.name },
        search: TAXONOMY_LIST_DEFAULT_SEARCH,
      });
    }
    return { taxonomy };
  },
  component: NewTermRoute,
});

function NewTermRoute(): ReactNode {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { taxonomy } = Route.useRouteContext();
  const renderLabel = useLabel();
  const mapTermError = useTermErrorMessage();
  const [serverError, setServerError] = useState<string | null>(null);

  // For hierarchical termTaxonomies we pull the existing term set so the
  // parent picker can render a depth-indented list. Skipped for flat
  // termTaxonomies — no parent, no query.
  const isHierarchical = taxonomy.isHierarchical === true;
  const parents = useQuery({
    ...orpc.term.list.queryOptions({
      input: { taxonomy: taxonomy.name, limit: 200 },
    }),
    enabled: isHierarchical,
  });
  const parentOptions = isHierarchical
    ? parentPickerOptions(parents.data ?? [])
    : [];

  const createTerm = useMutation({
    mutationFn: (values: {
      name: string;
      slug: string;
      description: string;
      parentId: number | null;
    }) =>
      orpc.term.create.call({
        taxonomy: taxonomy.name,
        name: values.name,
        // Server requires a slug on create; derive from the name if
        // the user left it blank. Matches the post editor's auto-slug
        // behaviour (same `slugify` helper).
        slug: values.slug.length > 0 ? values.slug : slugify(values.name),
        ...(values.description.length > 0
          ? { description: values.description }
          : {}),
        ...(values.parentId != null ? { parentId: values.parentId } : {}),
      }),
    onMutate: () => {
      setServerError(null);
    },
    onSuccess: async () => {
      // Awaited because the navigate target IS the list page; without
      // this the user lands on a 60s-stale cache before refetch.
      await queryClient.invalidateQueries({
        queryKey: orpc.term.list.key({ input: { taxonomy: taxonomy.name } }),
      });
      void navigate({
        to: "/terms/$name",
        params: { name: taxonomy.name },
        search: TAXONOMY_LIST_DEFAULT_SEARCH,
      });
    },
    onError: (err) => {
      setServerError(mapTermError(err, renderLabel(M.createFallback)));
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Link
        to="/terms/$name"
        params={{ name: taxonomy.name }}
        search={TAXONOMY_LIST_DEFAULT_SEARCH}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
        data-testid="term-new-back-link"
      >
        <ArrowLeft className="size-4" />
        {renderLabel(termTaxonomyLabel(taxonomy, "allItems"))}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="term-new-heading">
              {renderLabel(termTaxonomyLabel(taxonomy, "addNewItem"))}
            </h1>
          </CardTitle>
          <CardDescription>
            {renderLabel(
              isHierarchical ? M.hierarchicalDescription : M.flatDescription,
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TermForm
            initialValues={{
              name: "",
              slug: "",
              description: "",
              parentId: null,
              meta: {},
            }}
            isHierarchical={isHierarchical}
            parentOptions={parentOptions}
            isSubmitting={createTerm.isPending}
            serverError={serverError}
            submitLabel={renderLabel(termTaxonomyLabel(taxonomy, "addNewItem"))}
            // Meta-on-create lands in a follow-up; today meta only
            // renders on the edit screen because empty boxes still
            // confuse plugin authors expecting meaningful defaults.
            metaBoxes={[]}
            onSubmit={(values) => {
              // Short-circuit the RPC when the user left slug blank and
              // the derived slug would also be empty (CJK, emoji, pure
              // punctuation — scripts the transliterate lib doesn't
              // cover). Surfacing this inline beats a 400 round-trip.
              if (
                values.slug.length === 0 &&
                slugify(values.name).length === 0
              ) {
                setServerError(renderLabel(M.emptySlug));
                return;
              }
              createTerm.mutate(values);
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
    </div>
  );
}
