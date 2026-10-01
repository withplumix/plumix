const NO_LATER_TICKET_WILL_FARE_BETTER =
  /(session|usage|rate|message|weekly|daily|monthly)[\s_-]?limit|\b429\b|\b401\b|credit balance|quota|authentication|unauthor|invalid x-api-key|oauth|gh auth login/i;

export const looksLikeTheRunBeingOver = (reason: string): boolean =>
  NO_LATER_TICKET_WILL_FARE_BETTER.test(reason);

const RESETS_AT = /resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*\(utc\)/i;

export const whenTheLimitLifts = (
  reason: string,
  now: Date = new Date(),
): Date | null => {
  const printed = RESETS_AT.exec(reason);
  if (!printed || !looksLikeTheRunBeingOver(reason)) return null;

  const [, rawHour, rawMinute, meridiem] = printed;
  const hour =
    (Number(rawHour) % 12) + (meridiem?.toLowerCase() === "pm" ? 12 : 0);
  const lifts = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hour,
      Number(rawMinute ?? 0),
    ),
  );
  if (lifts <= now) lifts.setUTCDate(lifts.getUTCDate() + 1);
  return lifts;
};

const TIMES_A_STEP_WAITS_OUT_A_LIMIT = 2;
const A_MINUTE_PAST_THE_RESET_MS = 60_000;
const MODEL_WENT_MISSING = /unrecognized_model/;
const POLL_FOR_THE_MODEL_EVERY_MS = 15 * 60_000;
const TIMES_A_STEP_POLLS_FOR_THE_MODEL = 20;

interface LimitClock {
  readonly now: () => Date;
  readonly pause: (ms: number) => Promise<void>;
  readonly onWait?: (lifts: Date) => void;
}

export const waitOutALimit = async <T>(
  start: () => Promise<T>,
  { now, pause, onWait }: LimitClock,
): Promise<T> => {
  let polls = 0;
  let waits = 0;
  for (;;) {
    try {
      return await start();
    } catch (error) {
      if (
        MODEL_WENT_MISSING.test(String(error)) &&
        polls < TIMES_A_STEP_POLLS_FOR_THE_MODEL
      ) {
        polls += 1;
        onWait?.(new Date(now().getTime() + POLL_FOR_THE_MODEL_EVERY_MS));
        await pause(POLL_FOR_THE_MODEL_EVERY_MS);
        continue;
      }
      const lifts = whenTheLimitLifts(String(error), now());
      if (!lifts || waits === TIMES_A_STEP_WAITS_OUT_A_LIMIT) throw error;
      waits += 1;
      onWait?.(lifts);
      await pause(
        lifts.getTime() - now().getTime() + A_MINUTE_PAST_THE_RESET_MS,
      );
    }
  }
};

const GITHUB_DROPPED_IT =
  /internal server error|\b50[0234]\b|could not resolve host|connection reset|connection timed out|operation timed out|early eof|unexpected disconnect/i;

const PAUSES_BEFORE_ANOTHER_TRY_MS = [10_000, 30_000, 60_000];

export const retryWhatGitHubDropped = async <T>(
  attempt: () => Promise<T>,
  pause: (ms: number) => Promise<void>,
): Promise<T> => {
  for (const ms of PAUSES_BEFORE_ANOTHER_TRY_MS) {
    try {
      return await attempt();
    } catch (error) {
      if (!GITHUB_DROPPED_IT.test(String(error))) throw error;
      await pause(ms);
    }
  }
  return attempt();
};
