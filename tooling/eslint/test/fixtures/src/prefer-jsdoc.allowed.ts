// Helpers

export function total(prices: readonly number[]): number {
  // Integer cents, so no rounding drift.
  const sum = prices.reduce((acc, price) => acc + price, 0);
  return sum;
}

export const LIMITS = {
  // Matches the CDN's own cap.
  maxAge: 60,
};

export const ratio = 2; // trailing remarks stay as they are

/** Already documented. */
export const offset = 1;

// Fires on `*/5` minutes; a doc comment can't hold that sequence.
export const SCHEDULE = "*/5 * * * *";
