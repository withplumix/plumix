import * as React from "react";

import { createDebouncedValue } from "./timers.js";

/** `value` once it has held still for `ms`; the first render returns it as is. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = React.useState(value);
  const debounced = React.useMemo(
    () => createDebouncedValue<T>(ms, (next) => setSettled(() => next)),
    [ms],
  );
  React.useEffect(() => debounced.cancel, [debounced]);
  React.useEffect(() => debounced.push(value), [debounced, value]);
  return settled;
}
