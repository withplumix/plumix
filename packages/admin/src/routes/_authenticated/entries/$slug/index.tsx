import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo, useState } from "react";
import { DataTable } from "@/components/data-table/data-table.js";
import { ListPagination } from "@/components/data-table/list-pagination.js";
import { MultiSelect } from "@/components/form/multi-select.js";
import { DebouncedSearchInput } from "@/components/form/search-input.js";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog.js";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group.js";
import { hasCap } from "@/lib/caps.js";
import { toDate } from "@/lib/dates.js";
import { findEntryTypeBySlug, findTermTaxonomyByName } from "@/lib/manifest.js";
import { orpc } from "@/lib/orpc.js";
import { buildFilterTermOptions } from "@/lib/terms.js";
import { cn } from "@/lib/utils.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ArrowUpDown, Plus } from "lucide-react";
import * as v from "valibot";

import type { EntryTypeManifestEntry } from "@plumix/core/manifest";
import type { Entry, EntryStatus, Term } from "@plumix/core/schema";

const PAGE_SIZE = 20;

// Mirrors `EntryStatus` from core's schema; kept local as a runtime array so
// the valibot picklist stays tree-shakeable (importing the core runtime
// symbol would pull drizzle into the admin bundle). The type import above
// keeps the two in lockstep — a drift would break compilation.
const ENTRY_STATUSES: readonly EntryStatus[] = [
  "draft",
  "published",
  "scheduled",
  "trash",
];
const STATUS_FILTER_VALUES = [...ENTRY_STATUSES, "all"] as const;
type StatusFilter = (typeof STATUS_FILTER_VALUES)[number];

// Local copy of core's `ENTRY_LIST_ORDER_COLUMNS` to keep the valibot
// picklist tree-shakeable (same rationale as `ENTRY_STATUSES` above —
// importing the core runtime symbol would pull drizzle into the admin
// bundle). Must stay in sync with `entryListInputSchema.orderBy`; a drift
// would fail server-side validation at runtime, not compile time.
const ORDER_BY_VALUES = [
  "updated_at",
  "published_at",
  "title",
  "menu_order",
] as const;
type OrderBy = (typeof ORDER_BY_VALUES)[number];

const ORDER_VALUES = ["asc", "desc"] as const;
type Order = (typeof ORDER_VALUES)[number];

const AUTHOR_VALUES = ["all", "mine"] as const;
type AuthorFilter = (typeof AUTHOR_VALUES)[number];

// `looseObject` keeps unknown keys verbatim so per-taxonomy filters
// land on the URL as `?category=foo&tag=bar` without requiring the
// schema to enumerate every taxonomy a plugin might register.
const searchSchema = v.looseObject({
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
  author: v.optional(v.fallback(v.picklist(AUTHOR_VALUES), "all"), "all"),
  orderBy: v.optional(
    v.fallback(v.picklist(ORDER_BY_VALUES), "updated_at"),
    "updated_at",
  ),
  order: v.optional(v.fallback(v.picklist(ORDER_VALUES), "desc"), "desc"),
});

const STATUS_VARIANT: Record<
  EntryStatus,
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

function buildColumns({
  activeOrderBy,
  activeOrder,
  onSort,
  adminSlug,
  canDelete,
  onTrash,
  trashingId,
}: {
  activeOrderBy: OrderBy;
  activeOrder: Order;
  onSort: (column: OrderBy, defaultDirection: Order) => void;
  adminSlug: string;
  canDelete: boolean;
  onTrash: (id: number) => void;
  trashingId: number | null;
}): ColumnDef<Entry>[] {
  return [
    {
      accessorKey: "title",
      header: () => (
        <SortableHeader
          label="Title"
          column="title"
          defaultDirection="asc"
          activeOrderBy={activeOrderBy}
          activeOrder={activeOrder}
          onSort={onSort}
        />
      ),
      cell: ({ row }) => (
        <TitleCell
          entry={row.original}
          adminSlug={adminSlug}
          canDelete={canDelete}
          onTrash={onTrash}
          isTrashing={trashingId === row.original.id}
        />
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
      meta: { className: "text-right" },
      header: () => (
        <SortableHeader
          label="Updated"
          column="updated_at"
          defaultDirection="desc"
          activeOrderBy={activeOrderBy}
          activeOrder={activeOrder}
          onSort={onSort}
          align="right"
        />
      ),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {dateFormatter.format(toDate(row.original.updatedAt))}
        </span>
      ),
    },
  ];
}

export const Route = createFileRoute("/_authenticated/entries/$slug/")({
  validateSearch: (search) => v.parse(searchSchema, search),
  // Resolve the manifest entry in `beforeLoad` so the route component never
  // has to handle a missing post type. `notFound()` is TanStack Router's
  // control-flow throw — it bubbles up to the nearest `notFoundComponent`,
  // which the admin renders as a generic 404.
  beforeLoad: ({ params }): { entryType: EntryTypeManifestEntry } => {
    const entryType = findEntryTypeBySlug(params.slug);
    if (!entryType) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router control-flow
      throw notFound();
    }
    return { entryType };
  },
  component: ContentListRoute,
});

// Parse comma-separated URL values (`?category=foo,bar`) into the slug
// array the server expects for multi-term filtering.
function parseTermFilters(
  search: Record<string, unknown>,
  taxonomyNames: readonly string[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const name of taxonomyNames) {
    const raw = search[name];
    if (typeof raw !== "string" || raw.length === 0) continue;
    const slugs = raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (slugs.length > 0) out[name] = slugs;
  }
  return out;
}

interface EntriesListNavActions {
  setStatus: (status: StatusFilter) => void;
  setPage: (page: number) => void;
  setSearch: (q: string | undefined) => void;
  setAuthor: (author: AuthorFilter) => void;
  setTermFilter: (taxonomy: string, slugs: readonly string[]) => void;
  setSort: (column: OrderBy, defaultDirection: Order) => void;
}

// useCallback keeps these navigation handlers stable across renders so
// the `columns` memo (and any future memoised consumers) doesn't
// invalidate on every tick.
function useEntriesListNavActions(): EntriesListNavActions {
  const navigate = Route.useNavigate();
  const setStatus = useCallback(
    (status: StatusFilter): void => {
      void navigate({ search: (prev) => ({ ...prev, status, page: 1 }) });
    },
    [navigate],
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
  const setAuthor = useCallback(
    (author: AuthorFilter): void => {
      void navigate({ search: (prev) => ({ ...prev, author, page: 1 }) });
    },
    [navigate],
  );
  const setTermFilter = useCallback(
    (taxonomy: string, slugs: readonly string[]): void => {
      void navigate({
        search: (prev) => {
          const next: Record<string, unknown> = {
            ...(prev as Record<string, unknown>),
            page: 1,
          };
          if (slugs.length > 0) {
            next[taxonomy] = slugs.join(",");
          } else {
            delete next[taxonomy];
          }
          return next as typeof prev;
        },
      });
    },
    [navigate],
  );
  // Clicking a sortable header: if it's already the active column, flip
  // direction; otherwise pick the column with a sensible default.
  const setSort = useCallback(
    (column: OrderBy, defaultDirection: Order): void => {
      void navigate({
        search: (prev) => ({
          ...prev,
          orderBy: column,
          order: nextSortOrder(
            prev.orderBy === column,
            prev.order,
            defaultDirection,
          ),
          page: 1,
        }),
      });
    },
    [navigate],
  );
  return { setStatus, setPage, setSearch, setAuthor, setTermFilter, setSort };
}

function ContentListRoute(): ReactNode {
  const search = Route.useSearch();
  const { user, entryType } = Route.useRouteContext();

  const taxonomyNames = entryType.termTaxonomies ?? EMPTY_TAXONOMY_NAMES;
  const termFilters = useMemo(
    () => parseTermFilters(search as Record<string, unknown>, taxonomyNames),
    [search, taxonomyNames],
  );

  const query = useQuery(
    orpc.entry.list.queryOptions({
      input: {
        type: entryType.name,
        limit: PAGE_SIZE,
        offset: (search.page - 1) * PAGE_SIZE,
        orderBy: search.orderBy,
        order: search.order,
        ...(search.status !== "all" ? { status: search.status } : {}),
        ...(search.q ? { search: search.q } : {}),
        ...(search.author === "mine" ? { authorId: user.id } : {}),
        ...(Object.keys(termFilters).length > 0
          ? { termTaxonomies: termFilters }
          : {}),
      },
    }),
  );

  const { setStatus, setPage, setSearch, setAuthor, setTermFilter, setSort } =
    useEntriesListNavActions();

  const rows: readonly Entry[] = query.data ?? [];
  const canPrev = search.page > 1;
  // Heuristic "next exists": a full page came back. Imprecise when total is an
  // exact multiple of PAGE_SIZE — the user sees an extra empty page. `entry.list`
  // doesn't expose a total count today; accept the edge case until it does.
  const canNext = rows.length === PAGE_SIZE;

  const pluralLabel = entryType.labels?.plural ?? entryType.label;
  const singularLabel = entryType.labels?.singular ?? entryType.label;
  const pluralLower = pluralLabel.toLowerCase();
  const singularLower = singularLabel.toLowerCase();

  // Capability gate for the "New" button. Uses the capability namespace
  // derived by core (`capabilityType ?? name`). Missing the cap? Hide the
  // button — the new-post route also redirects on `beforeLoad` but we
  // shouldn't surface the button at all.
  const createCapability = `entry:${entryType.capabilityType ?? entryType.name}:create`;
  const canCreate = hasCap(user.capabilities, createCapability);
  const deleteCapability = `entry:${entryType.capabilityType ?? entryType.name}:delete`;
  const canDelete = hasCap(user.capabilities, deleteCapability);

  const queryClient = useQueryClient();
  const [pendingTrashId, setPendingTrashId] = useState<number | null>(null);
  const trash = useMutation({
    mutationFn: (id: number) => orpc.entry.trash.call({ id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: orpc.entry.list.key({ input: { type: entryType.name } }),
      });
    },
    // Close the dialog regardless of outcome — keeping it open after a
    // server error left users stuck with no error surface and a still-
    // clickable Confirm button.
    onSettled: () => {
      setPendingTrashId(null);
    },
  });
  const onTrash = useCallback((id: number): void => {
    setPendingTrashId(id);
  }, []);
  const trashingId =
    trash.isPending && typeof trash.variables === "number"
      ? trash.variables
      : null;

  const columns = useMemo(
    () =>
      buildColumns({
        activeOrderBy: search.orderBy,
        activeOrder: search.order,
        onSort: setSort,
        adminSlug: entryType.adminSlug,
        canDelete,
        onTrash,
        trashingId,
      }),
    [
      search.orderBy,
      search.order,
      setSort,
      entryType.adminSlug,
      canDelete,
      onTrash,
      trashingId,
    ],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            data-testid="content-list-heading"
            className="text-2xl font-semibold"
          >
            {pluralLabel}
          </h1>
        </div>
        {canCreate ? (
          <Button asChild>
            <Link
              to="/entries/$slug/create"
              params={{ slug: entryType.adminSlug }}
              data-testid="content-list-new-button"
            >
              <Plus />
              New {singularLower}
            </Link>
          </Button>
        ) : null}
      </div>

      <StatusViews value={search.status} onChange={setStatus} />

      <div className="flex flex-wrap items-center gap-2">
        <AuthorSelect value={search.author} onChange={setAuthor} />
        {taxonomyNames.map((name) => (
          <TaxonomyFilter
            key={name}
            taxonomyName={name}
            value={termFilters[name] ?? EMPTY_TAXONOMY_NAMES}
            onChange={(slugs) => {
              setTermFilter(name, slugs);
            }}
          />
        ))}
        <div className="ms-auto">
          <DebouncedSearchInput
            // Keyed on the URL value so external navigations (back button,
            // links) remount the input with fresh local state instead of
            // desynchronising from the URL.
            key={search.q ?? ""}
            initialValue={search.q ?? ""}
            placeholder={`Search ${pluralLower}…`}
            testId="content-list-search-input"
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
        <DataTable<Entry>
          columns={columns}
          data={rows}
          isLoading={query.isPending}
          loadingLabel={`Loading ${pluralLower}`}
          emptyState={
            <EmptyState
              singularLower={singularLower}
              pluralLower={pluralLower}
              canCreate={canCreate}
              entryTypeSlug={entryType.adminSlug}
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

      <AlertDialog
        open={pendingTrashId !== null}
        onOpenChange={(open) => {
          if (!open) setPendingTrashId(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move {singularLower} to trash?</AlertDialogTitle>
            <AlertDialogDescription>
              You can restore it from the Trash view later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={trash.isPending}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-testid="content-list-trash-confirm"
              disabled={trash.isPending}
              onClick={(e) => {
                e.preventDefault();
                if (pendingTrashId !== null) trash.mutate(pendingTrashId);
              }}
            >
              {trash.isPending ? "Moving…" : "Move to trash"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// If the user clicks the already-active column, flip direction;
// otherwise pick the caller's sensible default (asc for alphabetical,
// desc for date-ish).
function nextSortOrder(
  isActiveColumn: boolean,
  currentOrder: Order,
  defaultDirection: Order,
): Order {
  if (!isActiveColumn) return defaultDirection;
  return currentOrder === "asc" ? "desc" : "asc";
}

// Three visual states: inactive (generic updown icon), active-asc (up),
// active-desc (down). The icon doubles as the a11y hint via the button's
// aria-label on the parent.
function SortIndicator({
  isActive,
  order,
}: {
  isActive: boolean;
  order: Order;
}): ReactNode {
  if (!isActive) return <ArrowUpDown aria-hidden className="size-3.5" />;
  if (order === "asc") return <ArrowUp aria-hidden className="size-3.5" />;
  return <ArrowDown aria-hidden className="size-3.5" />;
}

function SortableHeader({
  label,
  column,
  defaultDirection,
  activeOrderBy,
  activeOrder,
  onSort,
  align = "left",
}: {
  label: string;
  column: OrderBy;
  defaultDirection: Order;
  activeOrderBy: OrderBy;
  activeOrder: Order;
  onSort: (column: OrderBy, defaultDirection: Order) => void;
  align?: "left" | "right";
}): ReactNode {
  const isActive = activeOrderBy === column;
  const nextDirection = nextSortOrder(isActive, activeOrder, defaultDirection);
  return (
    <button
      type="button"
      onClick={() => {
        onSort(column, defaultDirection);
      }}
      data-testid={`content-list-sort-${column}`}
      className={cn(
        "hover:text-foreground inline-flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors",
        align === "right" ? "-mr-2 text-right" : "-ml-2 text-left",
      )}
      aria-label={`Sort by ${label} (${nextDirection})`}
      aria-pressed={isActive}
    >
      {label}
      <SortIndicator isActive={isActive} order={activeOrder} />
    </button>
  );
}

// WP-style title cell: title (clickable), slug, then a row-action
// strip below. Actions reserve vertical space always (`invisible`
// rather than `hidden`) so hover doesn't reflow the row.
function TitleCell({
  entry,
  adminSlug,
  canDelete,
  onTrash,
  isTrashing,
}: {
  entry: Entry;
  adminSlug: string;
  canDelete: boolean;
  onTrash: (id: number) => void;
  isTrashing: boolean;
}): ReactNode {
  const showTrashAction = canDelete && entry.status !== "trash";
  return (
    <div className="flex flex-col gap-0.5">
      <Link
        to="/entries/$slug/$id/edit"
        params={{ slug: adminSlug, id: entry.id }}
        data-testid={`content-list-row-${String(entry.id)}`}
        className="hover:text-primary font-medium transition-colors"
      >
        {entry.title || (
          <span className="text-muted-foreground italic">(no title)</span>
        )}
      </Link>
      <span className="text-muted-foreground text-xs">{entry.slug}</span>
      <div
        className={cn(
          "flex h-4 items-center gap-2 text-xs transition-opacity",
          "invisible group-hover/row:visible focus-within:visible",
        )}
        data-testid={`content-list-row-actions-${String(entry.id)}`}
      >
        <Link
          to="/entries/$slug/$id/edit"
          params={{ slug: adminSlug, id: entry.id }}
          className="text-muted-foreground hover:text-foreground"
        >
          Edit
        </Link>
        {showTrashAction ? (
          <>
            <span aria-hidden className="text-muted-foreground/50">
              |
            </span>
            <button
              type="button"
              disabled={isTrashing}
              onClick={() => {
                onTrash(entry.id);
              }}
              className="text-muted-foreground hover:text-destructive disabled:opacity-50"
              data-testid={`content-list-row-trash-${String(entry.id)}`}
            >
              {isTrashing ? "Trashing…" : "Trash"}
            </button>
          </>
        ) : null}
      </div>
    </div>
  );
}

// Pill-style status filter (shadcn ToggleGroup, single-select).
function StatusViews({
  value,
  onChange,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
}): ReactNode {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={value}
      onValueChange={(next) => {
        // ToggleGroup emits "" when the user toggles off the active
        // item; pin to "all" so the filter never lands in an invalid
        // empty state.
        onChange((next || "all") as StatusFilter);
      }}
      aria-label="Filter by status"
    >
      {STATUS_FILTER_OPTIONS.map((opt) => (
        <ToggleGroupItem
          key={opt.value}
          value={opt.value}
          data-testid={`status-view-${opt.value}`}
        >
          {opt.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

// Stable empty array reference — react-query returns a fresh `[]`
// fallback on every render when `data` is undefined, which breaks
// useMemo identity in `TaxonomyFilter`.
const EMPTY_TERMS: readonly Term[] = [];

// Stable fallback for `entryType.termTaxonomies ?? ...` so the array
// identity stays put across renders (otherwise `useMemo([..., names])`
// invalidates every tick when termTaxonomies is undefined).
const EMPTY_TAXONOMY_NAMES: readonly string[] = [];

const AUTHOR_FILTER_OPTIONS: readonly { value: AuthorFilter; label: string }[] =
  [
    { value: "all", label: "All authors" },
    { value: "mine", label: "Mine" },
  ];

function AuthorSelect({
  value,
  onChange,
}: {
  value: AuthorFilter;
  onChange: (next: AuthorFilter) => void;
}): ReactNode {
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        onChange(next as AuthorFilter);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label="Filter by author"
        data-testid="author-filter"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {AUTHOR_FILTER_OPTIONS.map((opt) => (
          <SelectItem
            key={opt.value}
            value={opt.value}
            data-testid={`author-filter-${opt.value}`}
          >
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function TaxonomyFilter({
  taxonomyName,
  value,
  onChange,
}: {
  taxonomyName: string;
  value: readonly string[];
  onChange: (slugs: readonly string[]) => void;
}): ReactNode {
  const taxonomy = findTermTaxonomyByName(taxonomyName);
  const termsQuery = useQuery(
    orpc.term.list.queryOptions({
      input: { taxonomy: taxonomyName, limit: 200 },
    }),
  );
  const isHierarchical = taxonomy?.isHierarchical === true;
  const options = useMemo(
    () =>
      buildFilterTermOptions(termsQuery.data ?? EMPTY_TERMS, isHierarchical),
    [termsQuery.data, isHierarchical],
  );

  const pluralLower = (taxonomy?.label ?? taxonomyName).toLowerCase();
  return (
    <MultiSelect
      options={options}
      value={value}
      onChange={onChange}
      placeholder={`All ${pluralLower}`}
      searchPlaceholder={`Search ${pluralLower}…`}
      emptyText={`No ${pluralLower} match.`}
      testId={`taxonomy-filter-${taxonomyName}`}
    />
  );
}

function EmptyState({
  singularLower,
  pluralLower,
  canCreate,
  entryTypeSlug,
}: {
  singularLower: string;
  pluralLower: string;
  canCreate: boolean;
  entryTypeSlug: string;
}): ReactNode {
  return (
    <Empty data-testid="content-list-empty-state" className="border">
      <EmptyHeader>
        <EmptyTitle>No {pluralLower} yet</EmptyTitle>
        <EmptyDescription>
          Create your first {singularLower} to see it here.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {canCreate ? (
          <Button asChild>
            <Link to="/entries/$slug/create" params={{ slug: entryTypeSlug }}>
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
