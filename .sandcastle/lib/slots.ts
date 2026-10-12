export interface Slots {
  readonly run: <T>(work: () => Promise<T>) => Promise<T>;
  readonly runFirst: <T>(work: () => Promise<T>) => Promise<T>;
}

export const slotsFor = (capacity: number): Slots => {
  let free = Math.max(1, capacity);
  const waitingFirst: (() => void)[] = [];
  const waiting: (() => void)[] = [];
  const acquire = (ahead: boolean): Promise<void> => {
    if (free > 0) {
      free -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) =>
      (ahead ? waitingFirst : waiting).push(resolve),
    );
  };
  const release = (): void => {
    const next = waitingFirst.shift() ?? waiting.shift();
    if (next) next();
    else free += 1;
  };
  const inASlot =
    (ahead: boolean) =>
    async <T>(work: () => Promise<T>): Promise<T> => {
      await acquire(ahead);
      try {
        return await work();
      } finally {
        release();
      }
    };
  return { run: inASlot(false), runFirst: inASlot(true) };
};
