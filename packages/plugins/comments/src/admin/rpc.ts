import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type CommentStatus = "pending" | "approved" | "spam" | "trash";

export interface ModerationCommentDTO {
  readonly id: number;
  readonly entryId: number;
  readonly parentId: number | null;
  readonly status: CommentStatus;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly bodyMd: string;
  readonly ipHash: string | null;
  readonly userAgent: string | null;
  readonly createdAt: string;
}

type StatusCounts = Record<CommentStatus, number>;
export type ModerationAction =
  | "approve"
  | "spam"
  | "trash"
  | "restore"
  | "purge";

const COMMENTS_KEY = ["comments"] as const;

async function rpcCall<TOutput>(
  procedure: string,
  input: unknown = {},
): Promise<TOutput> {
  const res = await fetch(`/_plumix/rpc/${procedure}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-plumix-request": "1" },
    body: JSON.stringify({ json: input, meta: [] }),
  });
  const envelope = (await res.json().catch(() => null)) as {
    json?: unknown;
  } | null;
  if (!res.ok) {
    const error = envelope?.json as
      | { message?: string; data?: { reason?: string } }
      | undefined;
    // eslint-disable-next-line no-restricted-syntax -- rethrow server-derived rpc error
    throw new Error(
      error?.data?.reason ?? error?.message ?? `rpc_${String(res.status)}`,
    );
  }
  return envelope?.json as TOutput;
}

export function useCommentCounts(): UseQueryResult<StatusCounts> {
  return useQuery({
    queryKey: [...COMMENTS_KEY, "counts"],
    queryFn: () => rpcCall<StatusCounts>("comments/counts"),
  });
}

interface QueueFilters {
  readonly search?: string;
  readonly entryId?: number;
}

export function useCommentList(
  status: CommentStatus,
  filters: QueueFilters = {},
): UseQueryResult<ModerationCommentDTO[]> {
  return useQuery({
    queryKey: [...COMMENTS_KEY, "list", status, filters],
    queryFn: () =>
      rpcCall<ModerationCommentDTO[]>("comments/list", { status, ...filters }),
  });
}

export const BULK_ACTIONS = ["approve", "spam", "trash"] as const;
export type BulkAction = (typeof BULK_ACTIONS)[number];

export function useBulkModeration(): UseMutationResult<
  unknown,
  Error,
  { action: BulkAction; ids: number[] }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, ids }) => rpcCall("comments/bulk", { action, ids }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMENTS_KEY }),
  });
}

export function useModeration(): UseMutationResult<
  unknown,
  Error,
  { action: ModerationAction; id: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ action, id }) => rpcCall(`comments/${action}`, { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMENTS_KEY }),
  });
}
