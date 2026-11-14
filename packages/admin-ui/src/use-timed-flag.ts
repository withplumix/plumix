import * as React from "react";

import { createTimedFlag } from "./timers.js";

/**
 * A flag such as "Copied" that `trigger` turns on for `ms` and `reset` turns
 * off early. Each trigger restarts the countdown, and unmounting cancels it.
 */
export function useTimedFlag(
  ms: number,
): readonly [on: boolean, trigger: () => void, reset: () => void] {
  const [on, setOn] = React.useState(false);
  const flag = React.useMemo(() => createTimedFlag(ms, setOn), [ms]);
  React.useEffect(() => flag.cancel, [flag]);
  return [on, flag.trigger, flag.reset];
}
