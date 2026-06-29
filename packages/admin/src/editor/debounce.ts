interface Debouncer<Args extends readonly unknown[]> {
  readonly call: (...args: Args) => void;
  /** Run any pending work now and resolve when it settles, so callers can
   *  await persistence before navigating away. Resolves immediately when idle. */
  readonly flush: () => Promise<void>;
  readonly cancel: () => void;
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
  };
}
