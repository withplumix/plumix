import type { ColumnDef } from "@tanstack/react-table";
import type { ReactNode } from "react";
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
import { orpc } from "@/lib/orpc.js";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import * as v from "valibot";

const PAGE_SIZE = 20;

const POST_STATUSES = ["draft", "published", "scheduled", "trash"] as const;

type PostStatus = (typeof POST_STATUSES)[number];

const statusFilterSchema = v.picklist([...POST_STATUSES, "all"] as const);

const postsSearchSchema = v.object({
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1)), 1),
  status: v.optional(statusFilterSchema, "all"),
});

type PostsSearch = v.InferOutput<typeof postsSearchSchema>;

// Post row as returned by post.list — the server exposes the full row; we
// type a narrow view of what the table renders. `updatedAt` is widened to
// `Date | string` so ISO-string payloads from mocks / intermediate hops
// render without crashing; we normalise at the cell level.
interface PostRow {
  readonly id: number;
  readonly title: string;
  readonly slug: string;
  readonly status: PostStatus;
  readonly updatedAt: Date | string;
}

function toDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

const STATUS_VARIANT: Record<
  PostStatus,
  "default" | "secondary" | "outline" | "destructive"
> = {
  published: "default",
  draft: "secondary",
  scheduled: "outline",
  trash: "destructive",
};

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

const columns: ColumnDef<PostRow, unknown>[] = [
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
      <Badge variant={STATUS_VARIANT[row.original.status]}>
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

export const Route = createFileRoute("/_authenticated/posts/")({
  validateSearch: (search) => v.parse(postsSearchSchema, search),
  component: PostsListRoute,
});

function PostsListRoute(): ReactNode {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const query = useQuery(
    orpc.post.list.queryOptions({
      input: {
        limit: PAGE_SIZE,
        offset: (search.page - 1) * PAGE_SIZE,
        ...(search.status !== "all" ? { status: search.status } : {}),
      },
    }),
  );

  const setStatus = (status: PostsSearch["status"]) => {
    void navigate({ search: { status, page: 1 } });
  };
  const setPage = (page: number) => {
    void navigate({ search: { ...search, page } });
  };

  const rows: readonly PostRow[] = query.data ?? [];
  const canPrev = search.page > 1;
  const canNext = rows.length === PAGE_SIZE;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Posts</h1>
          <p className="text-muted-foreground text-sm">
            Manage posts. Draft, scheduled, and trashed items only show for
            users with the edit-any capability.
          </p>
        </div>
        <Button disabled title="Post editor lands in a follow-up PR">
          <Plus />
          New post
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <StatusFilter value={search.status} onChange={setStatus} />
      </div>

      {query.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            {query.error instanceof Error
              ? query.error.message
              : "Couldn't load posts. Try again."}
          </AlertDescription>
        </Alert>
      ) : (
        <DataTable<PostRow>
          columns={columns}
          data={rows}
          isLoading={query.isPending}
          emptyState={<PostsEmptyState />}
        />
      )}

      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-sm">
          Page {search.page}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!canPrev || query.isPending}
            onClick={() => setPage(search.page - 1)}
          >
            <ChevronLeft />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!canNext || query.isPending}
            onClick={() => setPage(search.page + 1)}
          >
            Next
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: PostsSearch["status"];
  onChange: (v: PostsSearch["status"]) => void;
}): ReactNode {
  const options: { value: PostsSearch["status"]; label: string }[] = [
    { value: "all", label: "All" },
    { value: "published", label: "Published" },
    { value: "draft", label: "Draft" },
    { value: "scheduled", label: "Scheduled" },
    { value: "trash", label: "Trash" },
  ];
  return (
    <div role="group" aria-label="Filter by status" className="flex gap-1">
      {options.map((opt) => (
        <Button
          key={opt.value}
          variant={value === opt.value ? "default" : "outline"}
          size="sm"
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}

function PostsEmptyState(): ReactNode {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <Card className="max-w-sm border-dashed">
        <CardHeader>
          <CardTitle>No posts yet</CardTitle>
          <CardDescription>
            Create your first post to see it here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button disabled className="w-full">
            <Plus />
            New post (coming soon)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
