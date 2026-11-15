export interface TimedFlag {
  readonly trigger: () => void;
  readonly reset: () => void;
  readonly cancel: () => void;
}

export function createTimedFlag(
  ms: number,
  set: (on: boolean) => void,
): TimedFlag {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => clearTimeout(timer);
  return {
    trigger: () => {
      cancel();
      set(true);
      timer = setTimeout(() => set(false), ms);
    },
    reset: () => {
      cancel();
      set(false);
    },
    cancel,
  };
}

export interface DebouncedValue<T> {
  readonly push: (value: T) => void;
  readonly cancel: () => void;
}

export function createDebouncedValue<T>(
  ms: number,
  settle: (value: T) => void,
): DebouncedValue<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cancel = (): void => clearTimeout(timer);
  return {
    push: (value) => {
      cancel();
      timer = setTimeout(() => settle(value), ms);
    },
    cancel,
  };
}
