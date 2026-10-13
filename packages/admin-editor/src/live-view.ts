import type { View } from "./canvas-view.js";

/** A pan or zoom gesture, painted per event and committed once it settles. */
export interface LiveView {
  readonly gesturing: () => boolean;
  /** Paints `view` now and commits it once the gesture idles `settleMs`. */
  readonly move: (view: View) => void;
  /** Commits the last view now and ends the gesture; a no-op between them. */
  readonly settle: () => void;
  /** Drops a pending commit. */
  readonly cancel: () => void;
}

/**
 * One commit per gesture keeps a wheel burst from rendering the editor once
 * per event.
 */
export function createLiveView({
  apply,
  commit,
  settleMs,
}: {
  readonly apply: (view: View) => void;
  readonly commit: (view: View) => void;
  readonly settleMs: number;
}): LiveView {
  let last: View | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const settle = (): void => {
    cancel();
    if (!last) return;
    const view = last;
    last = null;
    commit(view);
  };

  return {
    gesturing: () => last !== null,
    move: (view) => {
      last = view;
      apply(view);
      cancel();
      timer = setTimeout(settle, settleMs);
    },
    settle,
    cancel,
  };
}
