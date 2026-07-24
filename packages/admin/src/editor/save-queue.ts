export interface SaveQueue {
  /**
   * Enqueue a save task. Tasks run one at a time in FIFO order — a task
   * never starts until the previous one has settled — so writes that share
   * an optimistic-concurrency token can't overlap and clobber each other.
   * The returned promise settles with the task's own result/rejection.
   */
  readonly run: <T>(task: () => Promise<T>) => Promise<T>;
}

/**
 * A minimal serial runner for autosave writes. The entry editor fires two
 * independent debouncers (content/meta → draft row, structural fields → live
 * row) that share one `expectedLiveUpdatedAt` token; without serialization a
 * live write bumps the token while a draft write is mid-flight, so the draft
 * write lands stale and the server rejects it with a `409` conflict. Funnelling
 * both debouncers' writes through one queue means each task reads the token
 * only after the previous write has already re-anchored it. (Explicit actions
 * like publish/discard run their own mutations outside this queue.)
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
