export function pluck<T, K extends keyof T>(item: T, key: K): T[K] {
  return item[key];
}

export interface Box<T = string> {
  readonly value: T;
}

export const boxed: Box<number> = { value: 0 };

export function formatId(id: number): string {
  return String(id).padStart(6, "0");
}

export function isReady(ready: boolean | undefined): boolean {
  return ready === true;
}

/** @deprecated pass an explicit mode */
export function open(): string;
export function open(mode: string): string;
export function open(mode?: string): string {
  return mode ?? "read";
}

// Only the zero-argument overload is deprecated, so a call that resolves to
// the current one stays silent — the case the exemptions in the workspace
// (libsql's `transaction`, react-router's `useBlocker`) sit on.
export const opened = open("write");
