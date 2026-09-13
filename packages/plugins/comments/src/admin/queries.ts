import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPluginRpcClient } from "plumix/admin";

const rpc = createPluginRpcClient("comments");

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
  "approve" | "spam" | "trash" | "restore" | "purge";

const COMMENTS_KEY = ["comments"] as const;

export function useCommentCounts(): UseQueryResult<StatusCounts> {
  return useQuery({
    queryKey: [...COMMENTS_KEY, "counts"],
    queryFn: () => rpc.call<StatusCounts>("counts"),
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
      rpc.call<ModerationCommentDTO[]>("list", { status, ...filters }),
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
    mutationFn: ({ action, ids }) => rpc.call("bulk", { action, ids }),
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
    mutationFn: ({ action, id }) => rpc.call(action, { id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMENTS_KEY }),
  });
}
