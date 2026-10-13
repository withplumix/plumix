// No client directive: the island transform shims every export into a
// component, so a hook would stop running.
import { useCallback, useLayoutEffect, useRef, useState } from "react";

import { singleFlight } from "./single-flight.js";

/**
 * A call made while the last is pending resolves to `null` unrun. Stable
 * across renders, and runs the latest render's `fn`.
 */
export function useSingleFlight<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | null> {
  const latest = useRef(fn);
  useLayoutEffect(() => {
    latest.current = fn;
  });
  const [guard] = useState(() =>
    singleFlight((call: () => Promise<R>) => call()),
  );
  return useCallback(
    (...args: A) => guard(() => latest.current(...args)),
    [guard],
  );
}
