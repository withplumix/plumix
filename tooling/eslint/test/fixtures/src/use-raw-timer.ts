export function useRawTimer(onDone: () => void): void {
  setTimeout(onDone, 1000);
}
