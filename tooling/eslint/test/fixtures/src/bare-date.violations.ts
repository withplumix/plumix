declare function now(): Date;

export function expiresAt(ttlMs: number): Date {
  return new Date(Date.now() + ttlMs);
}

export function stamp(): string {
  return new Date().toISOString();
}

export function due(at: Date): boolean {
  return at <= now() && new Date(at) < new Date(now().getTime() + 1);
}
