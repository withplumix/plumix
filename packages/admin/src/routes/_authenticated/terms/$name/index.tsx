import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table.js";
import { ListPagination } from "@/components/data-table/list-pagination.js";
import { DebouncedSearchInput } from "@/components/form/search-input.js";
import { buildTermTree, flattenTree } from "@/components/taxonomy/tree.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.js";
import { hasCap } from "@/lib/caps.js";
import { findTermTaxonomyByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import * as v from "valibot";

import type { TermTaxonomyManifestEntry } from "@plumix/core/manifest";
import type { Term } from "@plumix/core/schema";

// Flat (non-hierarchical) lists paginate conventionally. Hierarchical
// lists fetch a larger page so the tree renders as a coherent unit; the
// server's `term.list` caps at 200. Deployments with >200 terms will
// want a proper tree-aware paginator (root-level pagination + expand on
// demand) — deferred until someone has that problem.
const FLAT_PAGE_SIZE = 50;
const TREE_PAGE_SIZE = 200;

const searchSchema = v.object({
  page: v.optional(
    v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  q: v.optional(
    v.fallback(
      v.pipe(
        v.string(),
        v.trim(),
        v.maxLength(200),
        v.transform((value) => (value.length === 0 ? undefined : value)),
      ),
      undefined,
    ),
  ),
});

export const Route = createFileRoute("/_authenticated/terms/$name/")({
  validateSearch: (search) => v.parse(searchSchema, search),
  // Resolve the manifest entry in `beforeLoad` so the component never
  // has to handle a missing taxonomy — unregistered names bubble up to
  // the router's 404 state.
  beforeLoad: ({
    context,
    params,
  }): { taxonomy: TermTaxonomyManifestEntry } => {
    const taxonomy = findTermTaxonomyByName(params.name);
    if (!taxonomy) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // Server's `term.list` requires `${name}:read`. Check here too so
    // users land on a friendly redirect rather than a 403 from the RPC.
    if (!hasCap(context.user.capabilities, `term:${taxonomy.name}:read`)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { taxonomy };
  },
  component: TaxonomyListRoute,
});

// Row shape for the list table — `displayDepth` is the tree indent for
// hierarchical termTaxonomies (always 0 for flat ones). Keyed on the term
// so react-table can key rows cleanly even when the same term appears
// on different pages.
interface TermRow {
  readonly term: Term;
  readonly displayDepth: number;
}

// Hierarchical termTaxonomies render as a tree: flatten-with-depth so
// each row carries its indent level. Non-hierarchical just keeps the
// server-provided order. Searching in a hierarchical taxonomy
// temporarily collapses to flat-list mode so search results aren't
// hidden inside collapsed parents that didn't match — matches the
// WP behaviour where category search flattens.
function deriveTermRows(
  data: readonly Term[],
  isHierarchical: boolean,
  hasSearch: boolean,
): readonly TermRow[] {
  if (!isHierarchical || hasSearch) {
    return data.map((t) => ({ term: t, displayDepth: 0 }));
  }
  const tree = buildTermTree(data);
  return flattenTree(tree).map((n) => ({
    term: n.term,
    displayDepth: n.depth,
  }));
}

interface TaxonomyListNavActions {
  setPage: (page: number) => void;
  setSearch: (q: string | undefined) => void;
}

function useTaxonomyListNavActions(): TaxonomyListNavActions {
  const navigate = Route.useNavigate();
  const setPage = useCallback(
    (page: number): void => {
      void navigate({ search: (prev) => ({ ...prev, page }) });
    },
    [navigate],
  );
  const setSearch = useCallback(
    (q: string | undefined): void => {
      void navigate({ search: (prev) => ({ ...prev, q, page: 1 }) });
    },
    [navigate],
  );
  return { setPage, setSearch };
}

function TaxonomyListRoute(): ReactNode {
  const search = Route.useSearch();
  const { user, taxonomy } = Route.useRouteContext();
  const isHierarchical = taxonomy.isHierarchical === true;
  const pageSize = isHierarchical ? TREE_PAGE_SIZE : FLAT_PAGE_SIZE;

  const query = useQuery(
    orpc.term.list.queryOptions({
      input: {
        taxonomy: taxonomy.name,
        limit: pageSize,
        offset: (search.page - 1) * pageSize,
        ...(search.q ? { search: search.q } : {}),
      },
    }),
  );

  const { setPage, setSearch } = useTaxonomyListNavActions();

  // `query.data` is `Term[] | undefined`; depending on the identity of
  // `rawRows` directly in the tree memo below would make it re-run on
  // every render when data is undefined (fresh `[]` each time). Tie the
  // memo to the query itself — react-query gives us referential
  // stability on `data` across renders within the same request state.
  const rawRows = query.data;
  const rows: readonly TermRow[] = useMemo(
    () => deriveTermRows(rawRows ?? [], isHierarchical, Boolean(search.q)),
    [rawRows, isHierarchical, search.q],
  );

  const canPrev = search.page > 1;
  // Heuristic "next page exists": full page came back.
  const canNext = (rawRows?.length ?? 0) === pageSize;

  const canEdit = hasCap(user.capabilities, `term:${taxonomy.name}:edit`);
  const singularLower = (
    taxonomy.labels?.singular ?? taxonomy.label
  ).toLowerCase();
  const pluralLower = taxonomy.label.toLowerCase();

  const columns = useMemo<ColumnDef<TermRow>[]>(() => {
    return [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => {
          const term = row.original.term;
          const depth = row.original.displayDepth;
          return (
            <Link
              to="/terms/$name/$id/edit"
              params={{ name: taxonomy.name, id: term.id }}
              data-testid={`taxonomy-list-row-${String(term.id)}`}
              aria-level={depth + 1}
              className="hover:text-primary flex min-w-0 flex-col transition-colors"
            >
              <span className="font-medium">
                {depth > 0 ? (
                  <span
                    aria-hidden
                    className="text-muted-foreground/60 mr-1 font-normal select-none"
                  >
                    {"— ".repeat(depth)}
                  </span>
                ) : null}
                {term.name}
              </span>
              <span className="text-muted-foreground font-mono text-xs">
                {term.slug}
              </span>
            </Link>
          );
        },
      },
      {
        accessorKey: "description",
        header: "Description",
        cell: ({ row }) => {
          const value = row.original.term.description;
          if (value === null || value.length === 0) {
            return (
              <span aria-hidden className="text-muted-foreground/50">
                —
              </span>
            );
          }
          return (
            <span className="text-muted-foreground line-clamp-1 text-sm">
              {value}
            </span>
          );
        },
      },
    ];
  }, [taxonomy.name]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            data-testid="taxonomy-list-heading"
            className="text-2xl font-semibold capitalize"
          >
            {taxonomy.label}
          </h1>
          {taxonomy.description ? (
            <p className="text-muted-foreground text-sm">
              {taxonomy.description}
            </p>
          ) : null}
        </div>
        {canEdit ? (
          <Button asChild>
            <Link
              to="/terms/$name/create"
              params={{ name: taxonomy.name }}
              data-testid="taxonomy-list-new-button"
            >
              <Plus />
              New {singularLower}
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="ms-auto">
          <DebouncedSearchInput
            key={search.q ?? ""}
            initialValue={search.q ?? ""}
            placeholder={`Search ${pluralLower}…`}
            testId="taxonomy-list-search-input"
            onCommit={setSearch}
          />
        </div>
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : `Couldn't load ${pluralLower}. Try again.`}
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable<TermRow>
          columns={columns}
          data={rows}
          isLoading={query.isPending}
          loadingLabel={`Loading ${pluralLower}`}
          emptyState={
            <EmptyState
              singularLower={singularLower}
              canCreate={canEdit}
              taxonomyName={taxonomy.name}
            />
          }
        />
      )}

      <ListPagination
        page={search.page}
        canPrev={canPrev}
        canNext={canNext}
        isLoading={query.isPending}
        onPageChange={setPage}
      />
    </div>
  );
}

function EmptyState({
  singularLower,
  canCreate,
  taxonomyName,
}: {
  singularLower: string;
  canCreate: boolean;
  taxonomyName: string;
}): ReactNode {
  return (
    <Empty data-testid="taxonomy-list-empty-state" className="border">
      <EmptyHeader>
        <EmptyTitle>No {singularLower} yet</EmptyTitle>
        <EmptyDescription>
          Create your first {singularLower} to see it here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {canCreate ? (
          <Button asChild>
            <Link to="/terms/$name/create" params={{ name: taxonomyName }}>
              <Plus />
              New {singularLower}
            </Link>
          </Button>
        ) : (
          <Button disabled>
            <Plus />
            New {singularLower}
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}
