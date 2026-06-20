interface Entry<T> {
  readonly value: T;
  /** Edits sharing a non-null key collapse into the current step (typing,
   *  dragging); null is always a discrete step. */
  readonly coalesceKey: string | null;
}

// Cap retained undo steps so a long session can't grow the stack unbounded
// (each entry holds a full tree snapshot). Oldest steps fall off the back.
const MAX_HISTORY = 100;

export interface History<T> {
  readonly past: readonly Entry<T>[];
  readonly present: T;
  readonly presentKey: string | null;
  readonly future: readonly Entry<T>[];
}

export function initHistory<T>(value: T): History<T> {
  return { past: [], present: value, presentKey: null, future: [] };
}

/**
 * Record a new value. When `coalesceKey` matches the current step's key the
 * value replaces it in place (one undo step for a typing/drag burst);
 * otherwise the current value is pushed onto the past as a discrete step. Any
 * recorded edit clears the redo stack.
 */
export function recordHistory<T>(
  history: History<T>,
  value: T,
  coalesceKey: string | null,
): History<T> {
  if (coalesceKey !== null && coalesceKey === history.presentKey) {
    return { ...history, present: value, future: [] };
  }
  return {
    past: [
      ...history.past,
      { value: history.present, coalesceKey: history.presentKey },
    ].slice(-MAX_HISTORY),
    present: value,
    presentKey: coalesceKey,
    future: [],
  };
}

export function undo<T>(history: History<T>): History<T> {
  const prior = history.past.at(-1);
  if (!prior) return history;
  return {
    past: history.past.slice(0, -1),
    present: prior.value,
    presentKey: prior.coalesceKey,
    future: [
      { value: history.present, coalesceKey: history.presentKey },
      ...history.future,
    ],
  };
}

export function redo<T>(history: History<T>): History<T> {
  const [next, ...rest] = history.future;
  if (!next) return history;
  return {
    past: [
      ...history.past,
      { value: history.present, coalesceKey: history.presentKey },
    ],
    present: next.value,
    presentKey: next.coalesceKey,
    future: rest,
  };
}

export function canUndo<T>(history: History<T>): boolean {
  return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
  return history.future.length > 0;
}
