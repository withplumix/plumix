interface Debouncer<Args extends readonly unknown[]> {
  readonly call: (...args: Args) => void;
  // Resolves once pending work settles, so callers can await it before
  // navigating.
  readonly flush: () => Promise<void>;
  readonly cancel: () => void;
  readonly pending: () => boolean;
}

export function createDebouncer<Args extends readonly unknown[]>(
  fn: (...args: Args) => void | Promise<void>,
  delayMs: number,
): Debouncer<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Args | undefined;

  const fire = (): Promise<void> => {
    if (pending === undefined) return Promise.resolve();
    const args = pending;
    pending = undefined;
    timer = undefined;
    return Promise.resolve(fn(...args));
  };

  return {
    call(...args) {
      pending = args;
      clearTimeout(timer);
      timer = setTimeout(() => void fire(), delayMs);
    },
    flush() {
      clearTimeout(timer);
      return fire();
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
    pending() {
      return pending !== undefined;
    },
  };
}
