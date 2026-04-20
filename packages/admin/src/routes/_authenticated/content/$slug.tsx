import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { DataTable } from "@/components/data-table/data-table.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.js";
import { Input } from "@/components/ui/input.js";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination.js";
import { toDate } from "@/lib/dates.js";
import { findPostTypeBySlug } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Search } from "lucide-react";
import * as v from "valibot";

import type { PostTypeManifestEntry } from "@plumix/core/manifest";
import type { Post, PostStatus } from "@plumix/core/schema";

const PAGE_SIZE = 20;

// Mirrors `PostStatus` from core's schema; kept local as a runtime array so
// the valibot picklist stays tree-shakeable (importing the core runtime
// symbol would pull drizzle into the admin bundle). The type import above
// keeps the two in lockstep — a drift would break compilation.
const POST_STATUSES: readonly PostStatus[] = [
  "draft",
  "published",
  "scheduled",
  "trash",
];
const STATUS_FILTER_VALUES = [...POST_STATUSES, "all"] as const;
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

const searchSchema = v.object({
  page: v.optional(
    v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  status: v.optional(
    v.fallback(v.picklist(STATUS_FILTER_VALUES), "all"),
    "all",
  ),
  // Free-text search. Empty string coerces to `undefined` so the URL stays
  // clean (`?q=` doesn't linger after the user clears the input).
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

const STATUS_VARIANT: Record<
  PostStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  published: "default",
  draft: "secondary",
  scheduled: "outline",
  trash: "destructive",
};

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "published", label: "Published" },
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "trash", label: "Trash" },
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const columns: ColumnDef<Post>[] = [
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div className="flex flex-col">
        <span className="font-medium">
          {row.original.title || (
            <span className="text-muted-foreground italic">(no title)</span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">
          {row.original.slug}
        </span>
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge
        variant={STATUS_VARIANT[row.original.status]}
        className="capitalize"
      >
        {row.original.status}
      </Badge>
    ),
  },
  {
    accessorKey: "updatedAt",
    header: "Updated",
    cell: ({ row }) => (
      <span className="text-muted-foreground text-sm">
        {dateFormatter.format(toDate(row.original.updatedAt))}
      </span>
    ),
  },
];

export const Route = createFileRoute("/_authenticated/content/$slug")({
  validateSearch: (search) => v.parse(searchSchema, search),
  // Resolve the manifest entry in `beforeLoad` so the route component never
  // has to handle a missing post type. `notFound()` is TanStack Router's
  // control-flow throw — it bubbles up to the nearest `notFoundComponent`,
  // which the admin renders as a generic 404.
  beforeLoad: ({ params }): { postType: PostTypeManifestEntry } => {
    const postType = findPostTypeBySlug(params.slug);
    if (!postType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { postType };
  },
  component: ContentListRoute,
});

function ContentListRoute(): ReactNode {
  const search = Route.useSearch();
  const { postType } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });

  const query = useQuery(
    orpc.post.list.queryOptions({
      input: {
        type: postType.name,
        limit: PAGE_SIZE,
        offset: (search.page - 1) * PAGE_SIZE,
        ...(search.status !== "all" ? { status: search.status } : {}),
        ...(search.q ? { search: search.q } : {}),
      },
    }),
  );

  const setStatus = (status: StatusFilter): void => {
    void navigate({ search: (prev) => ({ ...prev, status, page: 1 }) });
  };
  const setPage = (page: number): void => {
    void navigate({ search: (prev) => ({ ...prev, page }) });
  };
  const setSearch = (q: string | undefined): void => {
    void navigate({ search: (prev) => ({ ...prev, q, page: 1 }) });
  };

  const rows: readonly Post[] = query.data ?? [];
  const canPrev = search.page > 1;
  // Heuristic "next exists": a full page came back. Imprecise when total is an
  // exact multiple of PAGE_SIZE — the user sees an extra empty page. `post.list`
  // doesn't expose a total count today; accept the edge case until it does.
  const canNext = rows.length === PAGE_SIZE;

  const pluralLabel = postType.labels?.plural ?? postType.label;
  const singularLabel = postType.labels?.singular ?? postType.label;
  const pluralLower = pluralLabel.toLowerCase();
  const singularLower = singularLabel.toLowerCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">{pluralLabel}</h1>
          <p className="text-muted-foreground text-sm">
            Manage {pluralLower}. Draft, scheduled, and trashed items only show
            for users with the edit-any capability.
          </p>
        </div>
        <Button disabled title="Editor lands in a follow-up PR">
          <Plus />
          New {singularLower}
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusFilter value={search.status} onChange={setStatus} />
        <SearchInput
          // Keyed on the URL value so external navigations (back button,
          // links) remount the input with fresh local state instead of
          // desynchronising from the URL.
          key={search.q ?? ""}
          initialValue={search.q ?? ""}
          placeholder={`Search ${pluralLower}…`}
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
        <DataTable<Post>
          columns={columns}
          data={rows}
          isLoading={query.isPending}
          loadingLabel={`Loading ${pluralLower}`}
          emptyState={
            <EmptyState
              singularLower={singularLower}
              pluralLower={pluralLower}
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

const SEARCH_DEBOUNCE_MS = 250;

function SearchInput({
  initialValue,
  placeholder,
  onCommit,
}: {
  initialValue: string;
  placeholder: string;
  onCommit: (next: string | undefined) => void;
}): ReactNode {
  // Local state so typing feels immediate; commit to the URL (which
  // triggers the RPC refetch) after a debounce. Parent keys this
  // component on the URL value so external URL changes remount the
  // input rather than needing a setState-in-effect sync.
  const [value, setValue] = useState(initialValue);
  useEffect(() => {
    if (value === initialValue) return;
    const id = setTimeout(() => {
      onCommit(value.length === 0 ? undefined : value);
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(id);
    };
  }, [value, initialValue, onCommit]);

  return (
    <div className="relative">
      <Search
        aria-hidden
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2 size-4 -translate-y-1/2"
      />
      <Input
        type="search"
        role="searchbox"
        value={value}
        maxLength={200}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => {
          setValue(e.target.value);
        }}
        className="h-9 w-64 pl-8"
      />
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
}): ReactNode {
  return (
    <div role="group" aria-label="Filter by status" className="flex gap-1">
      {STATUS_FILTER_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? "default" : "outline"}
          size="sm"
          onClick={() => {
            onChange(opt.value);
          }}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function EmptyState({
  singularLower,
  pluralLower,
}: {
  singularLower: string;
  pluralLower: string;
}): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Card className="max-w-sm border-dashed">
        <CardHeader>
          <CardTitle>No {pluralLower} yet</CardTitle>
          <CardDescription>
            Create your first {singularLower} to see it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled className="w-full">
            <Plus />
            New {singularLower}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
