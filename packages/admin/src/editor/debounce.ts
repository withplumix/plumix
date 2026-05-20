interface Debouncer<Args extends readonly unknown[]> {
  readonly call: (...args: Args) => void;
  readonly flush: () => void;
  readonly cancel: () => void;
}

export function createDebouncer<Args extends readonly unknown[]>(
  fn: (...args: Args) => void | Promise<void>,
  delayMs: number,
): Debouncer<Args> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: Args | undefined;

  const fire = (): void => {
    if (pending === undefined) return;
    const args = pending;
    pending = undefined;
    timer = undefined;
    void fn(...args);
  };

  return {
    call(...args) {
      pending = args;
      clearTimeout(timer);
      timer = setTimeout(fire, delayMs);
    },
    flush() {
      clearTimeout(timer);
      fire();
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      pending = undefined;
    },
  };
}
