// The first caller for a key runs `work`; every caller for that key while it
// runs, or after it succeeded, gets the same promise.
export const oncePerKey = <A extends unknown[], R>(
  work: (...args: A) => Promise<R>,
): ((key: string, ...args: A) => Promise<R>) => {
  const settled = new Map<string, Promise<R>>();
  return (key, ...args) => {
    const known = settled.get(key);
    if (known) return known;
    const running = work(...args);
    settled.set(key, running);
    running.catch(() => settled.delete(key));
    return running;
  };
};
