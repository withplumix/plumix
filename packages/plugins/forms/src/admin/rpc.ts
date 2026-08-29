import type {
  UseInfiniteQueryResult,
  UseMutationResult,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import type {
  FormSummary,
  SubmissionCounts,
  SubmissionDTO,
  SubmissionFilter,
  SubmissionsPage,
  SubmissionStatus,
} from "../types.js";
import { EXPORT_PATH } from "../contract.js";

// The shapes the handlers return, read from where they are declared
// rather than declared a second time here — a second copy is a copy that
// can drift. `types.ts` carries no server imports, so nothing follows it
// into the browser bundle.
export type { SubmissionFilter };

const SUBMISSIONS_KEY = ["forms", "submissions"] as const;
// Outside the submissions key: the registry is code, and no write to a
// submission can change what forms exist.
const DEFINITIONS_KEY = ["forms", "definitions"] as const;

// The subdirectory the host is mounted under, which every worker-routed
// URL the admin builds has to carry.
function pluginBasePath(): string {
  return (
    (globalThis as { plumix?: { basePath?: string } }).plumix?.basePath ?? ""
  );
}

/** Where the export links point, under whatever the inbox is showing. */
export function submissionsExportHref(
  filter: SubmissionFilter,
  format: "csv" | "json",
): string {
  const query = new URLSearchParams({ format });
  if (filter.form !== undefined) query.set("form", filter.form);
  if (filter.status !== undefined) query.set("status", filter.status);
  return `${pluginBasePath()}${EXPORT_PATH}?${query.toString()}`;
}

async function rpcCall<TOutput>(
  procedure: string,
  input: unknown = {},
): Promise<TOutput> {
  const res = await fetch(
    `${pluginBasePath()}/_plumix/rpc/forms/${procedure}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-plumix-request": "1" },
      body: JSON.stringify({ json: input, meta: [] }),
    },
  );
  const envelope = (await res.json().catch(() => null)) as {
    json?: unknown;
  } | null;
  if (!res.ok) {
    const error = envelope?.json as
      { message?: string; data?: { reason?: string } } | undefined;
    // eslint-disable-next-line no-restricted-syntax -- admin-side rpc envelope rethrow; the server's message is the discriminator
    throw new Error(
      error?.data?.reason ?? error?.message ?? `rpc_${String(res.status)}`,
    );
  }
  return envelope?.json as TOutput;
}

/** The forms the plugin's registry knows about — no forms table exists. */
export function useFormDefinitions(): UseQueryResult<readonly FormSummary[]> {
  return useQuery({
    queryKey: DEFINITIONS_KEY,
    queryFn: () => rpcCall<readonly FormSummary[]>("definitions"),
  });
}

export function useSubmissionCounts(
  filter: SubmissionFilter,
): UseQueryResult<SubmissionCounts> {
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "counts", filter],
    queryFn: () => rpcCall<SubmissionCounts>("counts", filter),
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
      rpcCall<SubmissionsPage>(
        "list",
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
 * One submission, read on its own rather than picked out of the list:
 * the panel stays right after a status change drops the row out of the
 * filter it was opened from.
 */
export function useSubmission(
  id: number | null,
): UseQueryResult<SubmissionDTO> {
  return useQuery({
    queryKey: [...SUBMISSIONS_KEY, "get", id],
    queryFn: () => rpcCall<SubmissionDTO>("get", { id }),
    enabled: id !== null,
  });
}

function useSubmissionMutation<TInput, TOutput>(
  procedure: string,
): UseMutationResult<TOutput, Error, TInput> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: TInput) => rpcCall<TOutput>(procedure, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: SUBMISSIONS_KEY }),
  });
}

export function useSetSubmissionStatus(): UseMutationResult<
  { status: SubmissionStatus },
  Error,
  { id: number; status: SubmissionStatus }
> {
  return useSubmissionMutation("setStatus");
}

export function useSetSubmissionNote(): UseMutationResult<
  { note: string | null },
  Error,
  { id: number; note: string | null }
> {
  return useSubmissionMutation("setNote");
}

export function useDeleteSubmission(): UseMutationResult<
  { deleted: boolean },
  Error,
  { id: number }
> {
  return useSubmissionMutation("remove");
}
