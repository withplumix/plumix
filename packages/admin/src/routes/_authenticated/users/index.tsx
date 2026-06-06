import type { MessageDescriptor } from "@lingui/core";
import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { DataTable } from "@/components/data-table/data-table.js";
import { ListPagination } from "@/components/data-table/list-pagination.js";
import { DebouncedSearchInput } from "@/components/form/search-input.js";
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
import { hasCap } from "@/lib/caps.js";
import { toDate } from "@/lib/dates.js";
import { orpc } from "@/lib/orpc.js";
import { useFormatters } from "@/lib/use-formatters.js";
import { useLabel } from "@/lib/use-label.js";
import { ROLE_LABEL } from "@/lib/user-role-labels.js";
import { defineMessage } from "@lingui/core/macro";
import { Trans } from "@lingui/react";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { Plus, UserPlus } from "lucide-react";
import * as v from "valibot";

import type { Label } from "@plumix/core/i18n";
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

const M = {
  searchPlaceholder: defineMessage({
    id: "users.list.searchPlaceholder",
    message: "Search by email…",
  }),
  loadingLabel: defineMessage({
    id: "users.list.loading",
    message: "Loading users",
  }),
  loadFailed: defineMessage({
    id: "users.list.loadFailed",
    message: "Couldn't load users. Try again.",
  }),
  roleFilterAria: defineMessage({
    id: "users.list.roleFilter.aria",
    message: "Filter by role",
  }),
  roleFilterAll: defineMessage({
    id: "users.list.roleFilter.all",
    message: "All roles",
  }),
  columnUser: defineMessage({ id: "users.list.column.user", message: "User" }),
  columnRole: defineMessage({ id: "users.list.column.role", message: "Role" }),
  columnStatus: defineMessage({
    id: "users.list.column.status",
    message: "Status",
  }),
  columnLastSignIn: defineMessage({
    id: "users.list.column.lastSignIn",
    message: "Last sign-in",
  }),
  columnCreated: defineMessage({
    id: "users.list.column.created",
    message: "Created",
  }),
} satisfies Record<string, MessageDescriptor>;

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

interface UsersListNavActions {
  setRole: (role: RoleFilter) => void;
  setPage: (page: number) => void;
  setSearch: (q: string | undefined) => void;
}

function useUsersListNavActions(): UsersListNavActions {
  const navigate = Route.useNavigate();
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
  return { setRole, setPage, setSearch };
}

function UsersListRoute(): ReactNode {
  const search = Route.useSearch();
  const { user } = Route.useRouteContext();
  const label = useLabel();

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

  const { setRole, setPage, setSearch } = useUsersListNavActions();

  const rows = query.data ?? [];
  const canPrev = search.page > 1;
  // Heuristic "next page exists": full page came back. `user.list` doesn't
  // return a total, same tradeoff as `entry.list` — accept the occasional
  // empty-next-page when total is an exact multiple of PAGE_SIZE.
  const canNext = rows.length === PAGE_SIZE;

  // `user:create` is admin-only; editors see the list but don't get the
  // "Invite user" button. The route behind it also redirects on
  // `beforeLoad` for defense-in-depth.
  const canInvite = hasCap(user.capabilities, "user:create");

  const { formatDate, formatRelative } = useFormatters();
  const columns = useMemo(
    () =>
      buildColumns({
        currentUserId: user.id,
        formatDate,
        formatRelative,
        label,
      }),
    [user.id, formatDate, formatRelative, label],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1
            data-testid="users-list-heading"
            className="text-2xl font-semibold"
          >
            <Trans id="users.list.title" message="Users" />
          </h1>
        </div>
        {canInvite ? (
          <Button asChild>
            <Link to="/users/create" data-testid="users-list-invite-button">
              <UserPlus />
              <Trans id="users.list.invite" message="Add new" />
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RoleFilter value={search.role} onChange={setRole} />
        <div className="ms-auto">
          <DebouncedSearchInput
            // Keyed on the URL value so external navigations (back button,
            // links) remount the input with fresh local state instead of
            // desynchronising from the URL.
            key={search.q ?? ""}
            initialValue={search.q ?? ""}
            placeholder={label(M.searchPlaceholder)}
            testId="users-list-search-input"
            onCommit={setSearch}
          />
        </div>
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {label(
              query.error instanceof Error ? query.error.message : M.loadFailed,
            )}
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable<UserListRow>
          columns={columns}
          data={rows}
          isLoading={query.isPending}
          loadingLabel={label(M.loadingLabel)}
          emptyState={<EmptyState canInvite={canInvite} />}
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

// Mirrors the server's `user.list` row shape — `User` plus the
// `lastSignInAt` derived column. Local mirror because the wire type
// is generated by oRPC from the procedure handler at admin build time;
// the explicit declaration here keeps the column-builder fully typed
// without reaching into core's RPC internals.
type UserListRow = User & {
  readonly lastSignInAt: Date | string | null;
};

function buildColumns({
  currentUserId,
  formatDate,
  formatRelative,
  label,
}: {
  currentUserId: number;
  formatDate: (value: Date, options?: Intl.DateTimeFormatOptions) => string;
  formatRelative: (value: Date) => string;
  label: (l: Label) => string;
}): ColumnDef<UserListRow>[] {
  return [
    {
      accessorKey: "name",
      header: label(M.columnUser),
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
                <span className="text-muted-foreground italic">
                  <Trans id="users.list.row.noName" message="(no name)" />
                </span>
              )}
              {isSelf ? (
                <Badge
                  variant="outline"
                  className="text-xs"
                  data-testid="users-list-row-you"
                >
                  <Trans id="users.list.row.you" message="You" />
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
      header: label(M.columnRole),
      cell: ({ row }) => (
        <Badge variant={ROLE_VARIANT[row.original.role]} className="capitalize">
          {label(ROLE_LABEL[row.original.role])}
        </Badge>
      ),
    },
    {
      accessorKey: "disabledAt",
      header: label(M.columnStatus),
      cell: ({ row }) => {
        const disabled = row.original.disabledAt != null;
        return (
          <Badge variant={disabled ? "destructive" : "secondary"}>
            {disabled ? (
              <Trans id="users.list.row.disabled" message="Disabled" />
            ) : (
              <Trans id="users.list.row.active" message="Active" />
            )}
          </Badge>
        );
      },
    },
    {
      accessorKey: "lastSignInAt",
      meta: { className: "text-end" },
      header: label(M.columnLastSignIn),
      cell: ({ row }) => {
        const value = row.original.lastSignInAt;
        if (value == null) {
          return (
            <span className="text-muted-foreground text-sm italic">
              <Trans id="users.list.row.lastSignIn.never" message="Never" />
            </span>
          );
        }
        return (
          <span className="text-muted-foreground text-sm">
            {formatRelative(toDate(value))}
          </span>
        );
      },
    },
    {
      accessorKey: "createdAt",
      meta: { className: "text-end" },
      header: label(M.columnCreated),
      cell: ({ row }) => (
        <span className="text-muted-foreground text-sm">
          {formatDate(toDate(row.original.createdAt), { dateStyle: "medium" })}
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
  const label = useLabel();
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        onChange(next as RoleFilter);
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={label(M.roleFilterAria)}
        data-testid="users-role-filter"
        className="w-[180px]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all" data-testid="users-role-filter-all">
          {label(M.roleFilterAll)}
        </SelectItem>
        {USER_ROLES.map((role) => (
          <SelectItem
            key={role}
            value={role}
            data-testid={`users-role-filter-${role}`}
          >
            {label(ROLE_LABEL[role])}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function EmptyState({ canInvite }: { canInvite: boolean }): ReactNode {
  return (
    <Empty data-testid="users-list-empty-state" className="border">
      <EmptyHeader>
        <EmptyTitle>
          <Trans
            id="users.list.empty.title"
            message="No users match your filter"
          />
        </EmptyTitle>
        <EmptyDescription>
          <Trans
            id="users.list.empty.description"
            message="Clear the filter, or invite someone new to join."
          />
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        {canInvite ? (
          <Button asChild>
            <Link to="/users/create">
              <Plus />
              <Trans id="users.list.empty.invite" message="Invite user" />
            </Link>
          </Button>
        ) : (
          <Button disabled>
            <Plus />
            <Trans id="users.list.empty.invite" message="Invite user" />
          </Button>
        )}
      </EmptyContent>
    </Empty>
  );
}
