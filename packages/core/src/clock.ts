/** Where a site reads the time from; a test site's moves when the test says. */
export interface Clock {
  readonly now: () => number;
}

/** The clock in effect where it is read, `undefined` for real time. */
type ClockSource = () => Clock | undefined;

let source: ClockSource | undefined;

/**
 * Called by core's server side, so this module never imports the ambient
 * stores and a browser bundle can take `now()`.
 */
export function installClockSource(next: ClockSource): void {
  source = next;
}

/** The current site's time, or real time outside a site and in a browser. */
export function now(): Date {
  return new Date(source?.()?.now() ?? Date.now());
}
