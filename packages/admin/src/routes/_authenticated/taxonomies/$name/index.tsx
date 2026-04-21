import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table.js";
import { DebouncedSearchInput } from "@/components/form/search-input.js";
import { buildTermTree, flattenTree } from "@/components/taxonomy/tree.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination.js";
import { hasCap } from "@/lib/caps.js";
import { findTaxonomyByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import * as v from "valibot";

import type { TaxonomyManifestEntry } from "@plumix/core/manifest";
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

export const Route = createFileRoute("/_authenticated/taxonomies/$name/")({
  validateSearch: (search) => v.parse(searchSchema, search),
  // Resolve the manifest entry in `beforeLoad` so the component never
  // has to handle a missing taxonomy — unregistered names bubble up to
  // the router's 404 state.
  beforeLoad: ({ context, params }): { taxonomy: TaxonomyManifestEntry } => {
    const taxonomy = findTaxonomyByName(params.name);
    if (!taxonomy) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    // Server's `term.list` requires `${name}:read`. Check here too so
    // users land on a friendly redirect rather than a 403 from the RPC.
    if (!hasCap(context.user.capabilities, `${taxonomy.name}:read`)) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { taxonomy };
  },
  component: TaxonomyListRoute,
});

// Row shape for the list table — `displayDepth` is the tree indent for
// hierarchical taxonomies (always 0 for flat ones). Keyed on the term
// so react-table can key rows cleanly even when the same term appears
// on different pages.
interface TermRow {
  readonly term: Term;
  readonly displayDepth: number;
}

function TaxonomyListRoute(): ReactNode {
  const search = Route.useSearch();
  const { user, taxonomy } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });
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

  // `query.data` is `Term[] | undefined`; depending on the identity of
  // `rawRows` directly in the tree memo below would make it re-run on
  // every render when data is undefined (fresh `[]` each time). Tie the
  // memo to the query itself — react-query gives us referential
  // stability on `data` across renders within the same request state.
  const rawRows = query.data;

  // Hierarchical taxonomies render as a tree: flatten-with-depth so
  // each row carries its indent level. Non-hierarchical just keeps the
  // server-provided order. Searching in a hierarchical taxonomy
  // temporarily collapses to flat-list mode so search results aren't
  // hidden inside collapsed parents that didn't match — matches the
  // WP behaviour where category search flattens.
  const rows: readonly TermRow[] = useMemo(() => {
    const data = rawRows ?? [];
    if (!isHierarchical || search.q) {
      return data.map((t) => ({ term: t, displayDepth: 0 }));
    }
    const tree = buildTermTree(data);
    return flattenTree(tree).map((n) => ({
      term: n.term,
      displayDepth: n.depth,
    }));
  }, [rawRows, isHierarchical, search.q]);

  const canPrev = search.page > 1;
  // Heuristic "next page exists": full page came back.
  const canNext = (rawRows?.length ?? 0) === pageSize;

  const canEdit = hasCap(user.capabilities, `${taxonomy.name}:edit`);
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
          // `--taxonomy-indent` drives the left padding so the depth
          // visual is purely CSS — accessible to screen readers via the
          // `aria-level` below.
          const style = {
            paddingLeft: `${row.original.displayDepth * 1.5}rem`,
          };
          return (
            <Link
              to="/taxonomies/$name/$id"
              params={{ name: taxonomy.name, id: term.id }}
              data-testid={`taxonomy-list-row-${String(term.id)}`}
              aria-level={row.original.displayDepth + 1}
              className="hover:text-primary flex flex-col transition-colors"
              style={style}
            >
              <span className="font-medium">{term.name}</span>
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
        cell: ({ row }) => (
          <span className="text-muted-foreground line-clamp-1 text-sm">
            {row.original.term.description ?? ""}
          </span>
        ),
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
          ) : (
            <p className="text-muted-foreground text-sm">
              Manage {pluralLower} for this site.
            </p>
          )}
        </div>
        {canEdit ? (
          <Button asChild>
            <Link
              to="/taxonomies/$name/new"
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
        <DebouncedSearchInput
          key={search.q ?? ""}
          initialValue={search.q ?? ""}
          placeholder={`Search ${pluralLower}…`}
          testId="taxonomy-list-search-input"
          onCommit={setSearch}
        />
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

      <Pagination className="justify-between">
        <span className="text-muted-foreground text-sm">
          Page {search.page}
        </span>
        <PaginationContent>
          <PaginationItem>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canPrev || query.isPending}
              onClick={() => {
                setPage(search.page - 1);
              }}
              aria-label="Go to previous page"
            >
              <ChevronLeft />
              <span className="hidden sm:inline">Previous</span>
            </Button>
          </PaginationItem>
          <PaginationItem>
            <Button
              variant="ghost"
              size="sm"
              disabled={!canNext || query.isPending}
              onClick={() => {
                setPage(search.page + 1);
              }}
              aria-label="Go to next page"
            >
              <span className="hidden sm:inline">Next</span>
              <ChevronRight />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
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
    <div
      data-testid="taxonomy-list-empty-state"
      className="flex flex-col items-center gap-2 py-12 text-center"
    >
      <Card className="max-w-sm border-dashed">
        <CardHeader>
          <CardTitle>No {singularLower} yet</CardTitle>
          <CardDescription>
            Create your first {singularLower} to see it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canCreate ? (
            <Button asChild className="w-full">
              <Link to="/taxonomies/$name/new" params={{ name: taxonomyName }}>
                <Plus />
                New {singularLower}
              </Link>
            </Button>
          ) : (
            <Button disabled className="w-full">
              <Plus />
              New {singularLower}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
