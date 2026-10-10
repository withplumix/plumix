import type {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from "@tanstack/react-query";
import type { PluginRpcInputs, PluginRpcOutputs } from "plumix/admin";
import {
  keepPreviousData,
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { basePath, createPluginRpcClient } from "plumix/admin";

import type { SubmissionsRouter } from "../rpc.js";
import type {
  FormSummary,
  SubmissionCounts,
  SubmissionDTO,
  SubmissionFilter,
  SubmissionsPage,
} from "../types.js";
import { EXPORT_PATH } from "../contract.js";

const rpc = createPluginRpcClient<SubmissionsRouter>("forms");

type FormsInputs = PluginRpcInputs<SubmissionsRouter>;
type FormsOutputs = PluginRpcOutputs<SubmissionsRouter>;

// `types.ts` carries no server imports, so nothing follows it into the
// browser bundle.
export type { SubmissionFilter };

const SUBMISSIONS_KEY = ["forms", "submissions"] as const;
/**
 * Outside the submissions key: the registry is code, and no write to a
 * submission can change what forms exist.
 */
const DEFINITIONS_KEY = ["forms", "definitions"] as const;

/** Where the export links point, under whatever the inbox is showing. */
export function submissionsExportHref(
  filter: SubmissionFilter,
  format: "csv" | "json",
): string {
  const query = new URLSearchParams({ format });
  if (filter.form !== undefined) query.set("form", filter.form);
  if (filter.status !== undefined) query.set("status", filter.status);
  return `${basePath()}${EXPORT_PATH}?${query.toString()}`;
}

/** The forms the plugin's registry knows about — no forms table exists. */
export function useFormDefinitions(): UseQueryResult<readonly FormSummary[]> {
  return useQuery({
    queryKey: DEFINITIONS_KEY,
    queryFn: () => rpc.definitions(),
  });
}

export function useSubmissionCounts(
  filter: SubmissionFilter,
): UseQueryResult<SubmissionCounts> {
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "counts", filter],
    queryFn: () => rpc.counts(filter),
  });
}

export function useSubmissions(
  filter: SubmissionFilter,
): UseInfiniteQueryResult<{
  pages: SubmissionsPage[];
  pageParams: (string | undefined)[];
}> {
  return useInfiniteQuery({
    queryKey: [...SUBMISSIONS_KEY, "list", filter],
    queryFn: ({ pageParam }) =>
      rpc.list(
        pageParam === undefined ? filter : { ...filter, cursor: pageParam },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    // A filter change is a new query key. Without this the table blanks
    // to the loading state on every click of a status tab.
    placeholderData: keepPreviousData,
  });
}

/**
 * Read on its own, not from the list, so the panel survives a status
 * change dropping the row out of the filter.
 */
export function useSubmission(
  id: number | null,
): UseQueryResult<SubmissionDTO> {
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "get", id],
    // `skipToken` rather than `enabled`: it narrows `id` for the typed call.
    queryFn: id === null ? skipToken : () => rpc.get({ id }),
  });
}

function useSubmissionMutation<TInput, TOutput>(
  mutationFn: (input: TInput) => Promise<TOutput>,
): UseMutationResult<TOutput, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY }),
  });
}

export function useSetSubmissionStatus(): UseMutationResult<
  FormsOutputs["setStatus"],
  Error,
  FormsInputs["setStatus"]
> {
  return useSubmissionMutation((input) => rpc.setStatus(input));
}

export function useSetSubmissionNote(): UseMutationResult<
  FormsOutputs["setNote"],
  Error,
  FormsInputs["setNote"]
> {
  return useSubmissionMutation((input) => rpc.setNote(input));
}

export function useDeleteSubmission(): UseMutationResult<
  FormsOutputs["remove"],
  Error,
  FormsInputs["remove"]
> {
  return useSubmissionMutation((input) => rpc.remove(input));
}
