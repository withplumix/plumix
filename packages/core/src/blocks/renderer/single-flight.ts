/**
 * A second press in the same tick reads state from before the first, so
 * neither `disabled` nor a `submitting` flag can keep it out.
 */
export function singleFlight<A extends unknown[], R>(
  fn: (...args: A) => Promise<R>,
): (...args: A) => Promise<R | null> {
  let pending = false;
  return async (...args) => {
    if (pending) return null;
    pending = true;
    try {
      return await fn(...args);
    } finally {
      pending = false;
    }
  };
}
