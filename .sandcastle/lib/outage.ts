const NO_LATER_TICKET_WILL_FARE_BETTER =
  /(session|usage|rate|message)[\s_-]?limit|\b429\b|\b401\b|credit balance|quota|authentication|unauthor|invalid x-api-key|oauth/i;

export const looksLikeTheRunBeingOver = (reason: string): boolean =>
  NO_LATER_TICKET_WILL_FARE_BETTER.test(reason);
