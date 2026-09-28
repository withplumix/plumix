export interface Slots {
  readonly run: <T>(work: () => Promise<T>) => Promise<T>;
}

export const slotsFor = (capacity: number): Slots => {
  let free = Math.max(1, capacity);
  const waiting: (() => void)[] = [];
  const acquire = (): Promise<void> => {
    if (free > 0) {
      free -= 1;
      return Promise.resolve();
    }
    return new Promise((resolve) => waiting.push(resolve));
  };
  const release = (): void => {
    const next = waiting.shift();
    if (next) next();
    else free += 1;
  };
  return {
    run: async (work) => {
      await acquire();
      try {
        return await work();
      } finally {
        release();
      }
    },
  };
};
