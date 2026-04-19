import { QueryClient } from "@tanstack/react-query";

// Reasonable defaults for an admin SPA: keep data fresh for a minute to avoid
// thundering refetches on tab focus, still refetch on reconnect to recover
// from wake-from-sleep, retry once on network errors.
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}
