import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table.js";
import { DebouncedSearchInput } from "@/components/form/search-input.js";
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
import {
  Pagination,
  PaginationContent,
  PaginationItem,
} from "@/components/ui/pagination.js";
import { hasCap } from "@/lib/caps.js";
import { toDate } from "@/lib/dates.js";
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";
import {
  createFileRoute,
  Link,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, UserPlus } from "lucide-react";
import * as v from "valibot";

import type { User, UserRole } from "@plumix/core/schema";

import { USER_ROLES } from "./-constants.js";

const PAGE_SIZE = 20;

const ROLE_FILTER_VALUES = ["all", ...USER_ROLES] as const;
type RoleFilter = (typeof ROLE_FILTER_VALUES)[number];

const searchSchema = v.object({
  page: v.optional(
    v.fallback(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
    1,
  ),
  role: v.optional(v.fallback(v.picklist(ROLE_FILTER_VALUES), "all"), "all"),
  // Empty string coerces to `undefined` so `?q=` doesn't linger in the URL.
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

// Admin / editor = strong; author / contributor = neutral; subscriber =
// muted; disabled overrides everything to destructive to signal the
// blocked state at a glance (matches WordPress's greyed-out disabled
// user row).
const ROLE_VARIANT: Record<UserRole, "default" | "secondary" | "outline"> = {
  admin: "default",
  editor: "default",
  author: "secondary",
  contributor: "secondary",
  subscriber: "outline",
};

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Administrator",
  editor: "Editor",
  author: "Author",
  contributor: "Contributor",
  subscriber: "Subscriber",
};

const ROLE_FILTER_OPTIONS: { value: RoleFilter; label: string }[] = [
  { value: "all", label: "All roles" },
  ...USER_ROLES.map((role) => ({ value: role, label: ROLE_LABEL[role] })),
];

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
});

export const Route = createFileRoute("/_authenticated/users/")({
  validateSearch: (search) => v.parse(searchSchema, search),
  // Route-level capability gate. Without `user:list` there's nothing to
  // show and the RPC would 403 — redirect back to the dashboard so the
  // user doesn't land on a forbidden screen.
  beforeLoad: ({ context }) => {
    if (!hasCap(context.user.capabilities, "user:list")) {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- TanStack Router redirect pattern
      throw redirect({ to: "/" });
    }
  },
  component: UsersListRoute,
});

function UsersListRoute(): ReactNode {
  const search = Route.useSearch();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate({ from: Route.fullPath });

  const query = useQuery(
    orpc.user.list.queryOptions({
      input: {
        limit: PAGE_SIZE,
        offset: (search.page - 1) * PAGE_SIZE,
        ...(search.role !== "all" ? { role: search.role } : {}),
        ...(search.q ? { search: search.q } : {}),
      },
    }),
  );

  const setRole = useCallback(
    (role: RoleFilter): void => {
      void navigate({ search: (prev) => ({ ...prev, role, page: 1 }) });
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

  const rows: readonly User[] = query.data ?? [];
  const canPrev = search.page > 1;
  // Heuristic "next page exists": full page came back. `user.list` doesn't
  // return a total, same tradeoff as `post.list` — accept the occasional
  // empty-next-page when total is an exact multiple of PAGE_SIZE.
  const canNext = rows.length === PAGE_SIZE;

  // `user:create` is admin-only; editors see the list but don't get the
  // "Invite user" button. The route behind it also redirects on
  // `beforeLoad` for defense-in-depth.
  const canInvite = hasCap(user.capabilities, "user:create");

  const columns = useMemo(
    () => buildColumns({ currentUserId: user.id }),
    [user.id],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            data-testid="users-list-heading"
            className="text-2xl font-semibold"
          >
            Users
          </h1>
          <p className="text-muted-foreground text-sm">
            Manage people with access to this site. Invite new users via email —
            they'll enrol their passkey from the link you share.
          </p>
        </div>
        {canInvite ? (
          <Button asChild>
            <Link to="/users/new" data-testid="users-list-invite-button">
              <UserPlus />
              Invite user
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RoleFilter value={search.role} onChange={setRole} />
        <DebouncedSearchInput
          // Keyed on the URL value so external navigations (back button,
          // links) remount the input with fresh local state instead of
          // desynchronising from the URL.
          key={search.q ?? ""}
          initialValue={search.q ?? ""}
          placeholder="Search by email…"
          testId="users-list-search-input"
          onCommit={setSearch}
        />
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : "Couldn't load users. Try again."}
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable<User>
          columns={columns}
          data={rows}
          isLoading={query.isPending}
          loadingLabel="Loading users"
          emptyState={<EmptyState canInvite={canInvite} />}
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

function buildColumns({
  currentUserId,
}: {
  currentUserId: number;
}): ColumnDef<User>[] {
  return [
    {
      accessorKey: "name",
      header: "User",
      cell: ({ row }) => {
        const u = row.original;
        const isSelf = u.id === currentUserId;
        return (
          <div
            className="flex flex-col"
            data-testid={`users-list-row-${String(u.id)}`}
          >
            <span className="flex items-center gap-2 font-medium">
              {u.name ?? (
                <span className="text-muted-foreground italic">(no name)</span>
              )}
              {isSelf ? (
                <Badge variant="outline" className="text-xs">
                  You
                </Badge>
              ) : null}
            </span>
            <span className="text-muted-foreground text-xs">{u.email}</span>
          </div>
        );
      },
    },
    {
      accessorKey: "role",
      header: "Role",
      cell: ({ row }) => (
        <Badge variant={ROLE_VARIANT[row.original.role]} className="capitalize">
          {ROLE_LABEL[row.original.role]}
        </Badge>
      ),
    },
    {
      accessorKey: "disabledAt",
      header: "Status",
      cell: ({ row }) => {
        const disabled = row.original.disabledAt != null;
        return (
          <Badge variant={disabled ? "destructive" : "secondary"}>
            {disabled ? "Disabled" : "Active"}
          </Badge>
        );
      },
    },
    {
      accessorKey: "createdAt",
      header: "Joined",
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {dateFormatter.format(toDate(row.original.createdAt))}
        </span>
      ),
    },
  ];
}

function RoleFilter({
  value,
  onChange,
}: {
  value: RoleFilter;
  onChange: (next: RoleFilter) => void;
}): ReactNode {
  return (
    <div role="group" aria-label="Filter by role" className="flex gap-1">
      {ROLE_FILTER_OPTIONS.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? "default" : "outline"}
          size="sm"
          onClick={() => {
            onChange(opt.value);
          }}
          aria-pressed={value === opt.value}
          data-testid={`users-role-filter-${opt.value}`}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function EmptyState({ canInvite }: { canInvite: boolean }): ReactNode {
  return (
    <div
      data-testid="users-list-empty-state"
      className="flex flex-col items-center gap-2 py-12 text-center"
    >
      <Card className="max-w-sm border-dashed">
        <CardHeader>
          <CardTitle>No users match your filter</CardTitle>
          <CardDescription>
            Clear the filter, or invite someone new to join.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canInvite ? (
            <Button asChild className="w-full">
              <Link to="/users/new">
                <Plus />
                Invite user
              </Link>
            </Button>
          ) : (
            <Button disabled className="w-full">
              <Plus />
              Invite user
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
