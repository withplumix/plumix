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
