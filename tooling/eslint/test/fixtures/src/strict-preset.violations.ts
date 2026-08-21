/** @deprecated superseded by {@link readTitle} */
export function readLegacyTitle(): string {
  return "";
}

export const title = readLegacyTitle();

export function countOf<T>(items: readonly T[]): number {
  return items.length;
}

export interface Box<T = string> {
  readonly value: T;
}

export const boxed: Box<string> = { value: "" };

export function shout(text: string): string {
  return String(text).toUpperCase();
}

export function isReady(ready: boolean): boolean {
  return ready === true;
}
