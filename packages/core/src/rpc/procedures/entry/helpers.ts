export function stripUndefined<T extends Record<string, unknown>>(
  source: T,
): Partial<T> {
  const out: Partial<T> = {};
  for (const key of Object.keys(source) as (keyof T)[]) {
    const value = source[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}
