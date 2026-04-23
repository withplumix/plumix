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
import { findTaxonomyByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

import type { TaxonomyManifestEntry } from "@plumix/core/manifest";
import { slugify } from "@plumix/core/slugify";

import { TAXONOMY_LIST_DEFAULT_SEARCH } from "./-constants.js";
import { mapTermError } from "./-errors.js";

export const Route = createFileRoute("/_authenticated/taxonomies/$name/new")({
  beforeLoad: ({ context, params }): { taxonomy: TaxonomyManifestEntry } => {
    const taxonomy = findTaxonomyByName(params.name);
    if (!taxonomy) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // `term.create` requires `${name}:edit` — gate the route too so a
    // caller without edit doesn't land on a form that will 403 on save.
    if (!hasCap(context.user.capabilities, `${taxonomy.name}:edit`)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw redirect({
        to: "/taxonomies/$name",
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
  const { taxonomy } = Route.useRouteContext();
  const [serverError, setServerError] = useState<string | null>(null);

  // For hierarchical taxonomies we pull the existing term set so the
  // parent picker can render a depth-indented list. Skipped for flat
  // taxonomies — no parent, no query.
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
    onSuccess: () => {
      void navigate({
        to: "/taxonomies/$name",
        params: { name: taxonomy.name },
        search: TAXONOMY_LIST_DEFAULT_SEARCH,
      });
    },
    onError: (err) => {
      setServerError(mapTermError(err, "Couldn't create the term. Try again."));
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
        data-testid="term-new-back-link"
      >
        <ArrowLeft className="size-4" />
        Back to {taxonomy.label.toLowerCase()}
      </Link>

      <Card>
        <CardHeader>
          <CardTitle>
            <h1 data-testid="term-new-heading">New {singularLower}</h1>
          </CardTitle>
          <CardDescription>
            {isHierarchical
              ? "Pick a parent to nest this term, or leave empty for a root-level term."
              : `Add a new ${singularLower} for grouping content.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TermForm
            initialValues={{
              name: "",
              slug: "",
              description: "",
              parentId: null,
            }}
            isHierarchical={isHierarchical}
            parentOptions={parentOptions}
            isSubmitting={createTerm.isPending}
            serverError={serverError}
            submitLabel={`Create ${singularLower}`}
            // Meta-on-create lands in a follow-up; today meta only
            // renders on the edit screen because empty boxes still
            // confuse plugin authors expecting meaningful defaults.
            metaBoxes={[]}
            metaValues={{}}
            onMetaChange={() => {
              // no-op; meta boxes aren't rendered on create
            }}
            onSubmit={(values) => {
              // Short-circuit the RPC when the user left slug blank and
              // the derived slug would also be empty (CJK, emoji, pure
              // punctuation — scripts the transliterate lib doesn't
              // cover). Surfacing this inline beats a 400 round-trip.
              if (
                values.slug.length === 0 &&
                slugify(values.name).length === 0
              ) {
                setServerError(
                  "Couldn't derive a slug from that name — please type one manually.",
                );
                return;
              }
              createTerm.mutate(values);
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
    </div>
  );
}
