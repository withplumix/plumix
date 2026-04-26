import { getRuntime } from "./runtime.js";

const ns = getRuntime().reactQuery;

export default ns;

export const QueryClient = ns.QueryClient;
export const QueryClientProvider = ns.QueryClientProvider;
export const QueryCache = ns.QueryCache;
export const MutationCache = ns.MutationCache;
export const QueryErrorResetBoundary = ns.QueryErrorResetBoundary;
export const HydrationBoundary = ns.HydrationBoundary;
export const IsRestoringProvider = ns.IsRestoringProvider;

export const useQuery = ns.useQuery;
export const useQueries = ns.useQueries;
export const useInfiniteQuery = ns.useInfiniteQuery;
export const useMutation = ns.useMutation;
export const useMutationState = ns.useMutationState;
export const useQueryClient = ns.useQueryClient;
export const useIsFetching = ns.useIsFetching;
export const useIsMutating = ns.useIsMutating;
export const useIsRestoring = ns.useIsRestoring;
export const useSuspenseQuery = ns.useSuspenseQuery;
export const useSuspenseQueries = ns.useSuspenseQueries;
export const useSuspenseInfiniteQuery = ns.useSuspenseInfiniteQuery;

export const queryOptions = ns.queryOptions;
export const infiniteQueryOptions = ns.infiniteQueryOptions;
export const mutationOptions = ns.mutationOptions;
export const hydrate = ns.hydrate;
export const dehydrate = ns.dehydrate;
export const matchQuery = ns.matchQuery;
export const matchMutation = ns.matchMutation;
export const replaceEqualDeep = ns.replaceEqualDeep;
export const hashKey = ns.hashKey;
export const keepPreviousData = ns.keepPreviousData;
export const isCancelledError = ns.isCancelledError;
export const skipToken = ns.skipToken;
export const usePrefetchQuery = ns.usePrefetchQuery;
export const usePrefetchInfiniteQuery = ns.usePrefetchInfiniteQuery;

export const CancelledError = ns.CancelledError;
export const Query = ns.Query;
export const Mutation = ns.Mutation;
export const QueryObserver = ns.QueryObserver;
export const InfiniteQueryObserver = ns.InfiniteQueryObserver;
export const QueriesObserver = ns.QueriesObserver;
export const MutationObserver = ns.MutationObserver;
export const QueryClientContext = ns.QueryClientContext;
