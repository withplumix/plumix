import type { UseMutationResult, UseQueryResult } from "@tanstack/react-query";
import type { PluginRpcInputs, PluginRpcOutputs } from "plumix/admin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createPluginRpcClient } from "plumix/admin";

import type { CommentsRouter } from "../rpc.js";
import type { CommentStatus } from "../types.js";

const rpc = createPluginRpcClient<CommentsRouter>("comments");

type CommentsInputs = PluginRpcInputs<CommentsRouter>;
type CommentsOutputs = PluginRpcOutputs<CommentsRouter>;

export type { CommentStatus };
export type ModerationCommentDTO = CommentsOutputs["list"][number];
export type ModerationAction =
  "approve" | "spam" | "trash" | "restore" | "purge";

const COMMENTS_KEY = ["comments"] as const;

export function useCommentCounts(): UseQueryResult<CommentsOutputs["counts"]> {
  return useQuery({
    queryKey: [...COMMENTS_KEY, "counts"],
    queryFn: () => rpc.counts(),
  });
}

type QueueFilters = Pick<CommentsInputs["list"], "search" | "entryId">;

export function useCommentList(
  status: CommentStatus,
  filters: QueueFilters = {},
): UseQueryResult<CommentsOutputs["list"]> {
  return useQuery({
    queryKey: [...COMMENTS_KEY, "list", status, filters],
    queryFn: () => rpc.list({ status, ...filters }),
  });
}

export type BulkAction = CommentsInputs["bulk"]["action"];
export const BULK_ACTIONS = [
  "approve",
  "spam",
  "trash",
] as const satisfies readonly BulkAction[];

export function useBulkModeration(): UseMutationResult<
  CommentsOutputs["bulk"],
  Error,
  CommentsInputs["bulk"]
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input) => rpc.bulk(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMENTS_KEY }),
  });
}

export function useModeration(): UseMutationResult<
  CommentsOutputs[ModerationAction],
  Error,
  { action: ModerationAction; id: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    // `useMutation` wants one `Promise<T>`; a call on `rpc[action]` is a
    // union of five promise types until `async` folds them.
    mutationFn: async ({ action, id }) => rpc[action]({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: COMMENTS_KEY }),
  });
}
