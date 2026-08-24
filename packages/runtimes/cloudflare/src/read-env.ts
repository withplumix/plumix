/** The Worker `env` as this adapter reads it. Not JSON: alongside plain vars
 *  it carries live binding objects — KV namespaces, R2 buckets, DO stubs. */
export type WorkerEnv = Readonly<Record<string, unknown>>;

// Narrow a loosely-typed Worker env to a non-empty string binding/var.
export function readEnvString(env: unknown, key: string): string | undefined {
  const value = (env as WorkerEnv | null)?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
