export interface Slots {
  readonly run: <T>(work: () => Promise<T>) => Promise<T>;
  readonly runFirst: <T>(work: () => Promise<T>) => Promise<T>;
}

type Pool = "shared" | "held";

export const slotsFor = (
  capacity: number,
  { heldForFirst = 0 }: { readonly heldForFirst?: number } = {},
): Slots => {
  const free: Record<Pool, number> = {
    shared: Math.max(1, capacity),
    held: Math.max(0, heldForFirst),
  };
  const waitingFirst: ((pool: Pool) => void)[] = [];
  const waiting: ((pool: Pool) => void)[] = [];
  const acquire = (ahead: boolean): Promise<Pool> => {
    if (free.shared > 0) {
      free.shared -= 1;
      return Promise.resolve("shared");
    }
    if (ahead && free.held > 0) {
      free.held -= 1;
      return Promise.resolve("held");
    }
    return new Promise((resolve) =>
      (ahead ? waitingFirst : waiting).push(resolve),
    );
  };
  const release = (pool: Pool): void => {
    const next =
      pool === "held"
        ? waitingFirst.shift()
        : (waitingFirst.shift() ?? waiting.shift());
    if (next) next(pool);
    else free[pool] += 1;
  };
  const inASlot =
    (ahead: boolean) =>
    async <T>(work: () => Promise<T>): Promise<T> => {
      const pool = await acquire(ahead);
      try {
        return await work();
      } finally {
        release(pool);
      }
    };
  return { run: inASlot(false), runFirst: inASlot(true) };
};
