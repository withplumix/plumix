interface LongPressOptions {
  /** Milliseconds the finger must stay down to register as a long press. */
  readonly thresholdMs?: number;
  /** Pixel slop the finger can drift before the gesture cancels. */
  readonly slopPx?: number;
}

const DEFAULT_THRESHOLD_MS = 500;
const DEFAULT_SLOP_PX = 8;

/**
 * Wires touchstart / touchmove / touchend / touchcancel listeners onto
 * `target` and invokes `onLongPress` once the gesture completes — finger
 * down for at least `thresholdMs`, drift no further than `slopPx`. Returns
 * a detacher that removes the listeners and disarms any pending timer.
 *
 * Lives outside the Tiptap extension so the gesture logic is testable in
 * isolation with `vi.useFakeTimers()`.
 */
export function attachLongPressHandler(
  target: HTMLElement,
  onLongPress: () => void,
  options: LongPressOptions = {},
): () => void {
  const threshold = options.thresholdMs ?? DEFAULT_THRESHOLD_MS;
  const slop = options.slopPx ?? DEFAULT_SLOP_PX;

  let timer: ReturnType<typeof setTimeout> | null = null;
  let startX = 0;
  let startY = 0;

  const clear = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  const onTouchStart = (event: TouchEvent): void => {
    const t = event.touches[0];
    if (!t) return;
    startX = t.clientX;
    startY = t.clientY;
    clear();
    timer = setTimeout(() => {
      timer = null;
      onLongPress();
    }, threshold);
  };

  const onTouchMove = (event: TouchEvent): void => {
    if (timer === null) return;
    const t = event.touches[0];
    if (!t) return;
    if (
      Math.abs(t.clientX - startX) > slop ||
      Math.abs(t.clientY - startY) > slop
    ) {
      clear();
    }
  };

  // Passive: the handler never calls preventDefault, and being explicit
  // avoids Chrome's "scroll-blocking listener" performance warning.
  const passive = { passive: true } as const;
  target.addEventListener("touchstart", onTouchStart, passive);
  target.addEventListener("touchmove", onTouchMove, passive);
  target.addEventListener("touchend", clear, passive);
  target.addEventListener("touchcancel", clear, passive);

  return () => {
    clear();
    target.removeEventListener("touchstart", onTouchStart);
    target.removeEventListener("touchmove", onTouchMove);
    target.removeEventListener("touchend", clear);
    target.removeEventListener("touchcancel", clear);
  };
}
