const NO_LATER_TICKET_WILL_FARE_BETTER =
  /(session|usage|rate|message|weekly|daily|monthly)[\s_-]?limit|\b429\b|\b401\b|credit balance|quota|authentication|unauthor|invalid x-api-key|oauth|gh auth login/i;

export const looksLikeTheRunBeingOver = (reason: string): boolean =>
  NO_LATER_TICKET_WILL_FARE_BETTER.test(reason);

const RESETS_AT = /resets\s+(\d{1,2}):(\d{2})\s*(am|pm)\s*\(utc\)/i;

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
      Number(rawMinute),
    ),
  );
  if (lifts <= now) lifts.setUTCDate(lifts.getUTCDate() + 1);
  return lifts;
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
