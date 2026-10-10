export function total(prices: readonly number[]): number {
  // const discounted = prices.map((price) => price * 0.9);
  return prices.reduce((sum, price) => sum + price, 0);
}
