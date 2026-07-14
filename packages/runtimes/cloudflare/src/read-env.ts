// Narrow a loosely-typed Worker env to a non-empty string binding/var.
export function readEnvString(env: unknown, key: string): string | undefined {
  const value = (env as Record<string, unknown> | null)?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
