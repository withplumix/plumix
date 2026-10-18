/**
 * Concurrent first callers share one promise, so they await one fully
 * evaluated module. A rejection clears it, so the next call retries.
 */
export function loadOnce<T>(factory: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | undefined;
  return () =>
    (loading ??= factory().catch((error: unknown) => {
      loading = undefined;
      throw error;
    }));
}
