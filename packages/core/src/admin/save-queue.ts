export interface SaveQueue {
  /**
   * Starts only after the previous task settles, so token-sharing writes can't
   * overlap.
   */
  readonly run: <T>(task: () => Promise<T>) => Promise<T>;
}

/**
 * The draft and live debouncers share one live token; unserialized, a live
 * write mid-draft-write makes the server reject the draft with a 409.
 */
export function createSaveQueue(): SaveQueue {
  // Always-resolving barrier the next task awaits, so at most one runs at once.
  let barrier: Promise<void> = Promise.resolve();

  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = barrier.then(task);
      // Advance the barrier once this task settles, swallowing its outcome so a
      // rejected task can't poison the chain for tasks queued behind it.
      barrier = result.then(
        () => undefined,
        () => undefined,
      );
      return result;
    },
  };
}
