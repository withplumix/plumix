const NOTHING_THE_TICKET_DID =
  /usage limit|rate.?limit|\b429\b|\b401\b|\b529\b|credit balance|quota|authentication|unauthor|invalid x-api-key|oauth|overloaded/i;

export const looksLikeAnOutage = (reason: string): boolean =>
  NOTHING_THE_TICKET_DID.test(reason);
