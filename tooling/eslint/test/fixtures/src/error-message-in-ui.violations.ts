class RpcError extends Error {
  readonly code = "CONFLICT";
}

export function caught(err: unknown): string {
  if (err instanceof Error) return err.message;
  return "";
}

export function subclass(err: RpcError): string {
  return err.message;
}

export function queryError(query: { error: Error | null }): string {
  return query.error?.message ?? "";
}

export function thin(err: Error): string {
  // Shown verbatim: too short.
  const detail = err.message;
  return detail;
}

export function notConsole(err: Error, log: (value: string) => void): void {
  log(err.message);
}
