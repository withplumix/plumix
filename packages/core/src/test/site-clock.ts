import type { Clock } from "../clock.js";

export interface Travel {
  readonly days?: number;
  readonly hours?: number;
  readonly minutes?: number;
}

const MS_PER_MINUTE = 60_000;

/**
 * Real time shifted by every `travel`, until `freezeTime` stops it at an
 * instant that later travel moves.
 */
export function siteClock() {
  let offset = 0;
  let frozenAt: number | null = null;
  const clock: Clock = { now: () => frozenAt ?? Date.now() + offset };
  return {
    clock,
    travel: ({ days = 0, hours = 0, minutes = 0 }: Travel): void => {
      const ms = ((days * 24 + hours) * 60 + minutes) * MS_PER_MINUTE;
      if (frozenAt === null) offset += ms;
      else frozenAt += ms;
    },
    freezeTime: (iso: string): void => {
      frozenAt = Date.parse(iso);
    },
    reset: (): void => {
      offset = 0;
      frozenAt = null;
    },
  };
}
